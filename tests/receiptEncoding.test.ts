import { describe, it, expect, afterEach, vi } from 'vitest';
import { AIReconcileService } from '../services/aiReconcile.service';

// Helpers ---------------------------------------------------------------

const bytes = (...values: Array<number | string>) => {
  const out: number[] = [];
  for (const v of values) {
    if (typeof v === 'number') out.push(v);
    else for (const ch of v) out.push(ch.charCodeAt(0));
  }
  while (out.length < 24) out.push(0);
  return new Uint8Array(out);
};

const JPEG_BYTES = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG_BYTES = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a);
const HEIC_BYTES = bytes(0, 0, 0, 0x18, 'ftypheic');
const PDF_BYTES = bytes('%PDF-1.4');

const makeFile = (name: string, type: string, content: Uint8Array) =>
  new File([content as BlobPart], name, { type });

/** FileReader que falha, para simular arquivo ilegível (nuvem/permissão). */
function stubFailingFileReader(errorName = 'NotReadableError') {
  class FakeFileReader {
    result: any = null;
    error: any = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL() { this.fail(); }
    readAsArrayBuffer() { this.fail(); }
    fail() {
      setTimeout(() => {
        this.error = { name: errorName };
        this.onerror?.();
      }, 0);
    }
  }
  (globalThis as any).FileReader = FakeFileReader;
}

/** <img> que decodifica (onload) ou falha (onerror). */
function stubImage(behavior: { fail?: boolean; width?: number; height?: number }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = behavior.width ?? 1080;
    height = behavior.height ?? 2340;
    set src(_v: string) {
      setTimeout(() => (behavior.fail ? this.onerror?.() : this.onload?.()), 0);
    }
  }
  (globalThis as any).Image = FakeImage;
}

function stubCanvas(toDataURL: () => string) {
  const created: any[] = [];
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    const canvas: any = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => { } }),
      toDataURL,
    };
    created.push(canvas);
    return canvas;
  }) as any);
  return created;
}

function stubObjectUrl() {
  (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:fake');
  (globalThis as any).URL.revokeObjectURL = vi.fn();
}

const originals = {
  FileReader: (globalThis as any).FileReader,
  Image: (globalThis as any).Image,
  createImageBitmap: (globalThis as any).createImageBitmap,
  createObjectURL: (globalThis as any).URL.createObjectURL,
  revokeObjectURL: (globalThis as any).URL.revokeObjectURL,
};

afterEach(() => {
  (globalThis as any).FileReader = originals.FileReader;
  (globalThis as any).Image = originals.Image;
  (globalThis as any).createImageBitmap = originals.createImageBitmap;
  (globalThis as any).URL.createObjectURL = originals.createObjectURL;
  (globalThis as any).URL.revokeObjectURL = originals.revokeObjectURL;
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------

describe('encodeFileForAI', () => {
  it('usa createImageBitmap quando disponível, sem passar pelo FileReader', async () => {
    // O caminho antigo (FileReader -> data URL -> <img>) segurava bytes,
    // string base64 e bitmap ao mesmo tempo e derrubava a aba com fotos grandes.
    const close = vi.fn();
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close }));
    const readerSpy = vi.fn();
    (globalThis as any).FileReader = class { readAsDataURL() { readerSpy(); } };
    const canvases = stubCanvas(() => 'data:image/jpeg;base64,Y29tcHJlc3NlZA==');

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('foto.jpg', 'image/jpeg', JPEG_BYTES));

    expect(encoded).toEqual({ base64: 'Y29tcHJlc3NlZA==', mimeType: 'image/jpeg', fileName: 'foto.jpg' });
    expect(readerSpy).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    // 4000x3000 cabe em 1600 de lado maior.
    expect(canvases[0].width).toBe(1600);
    expect(canvases[0].height).toBe(1200);
  });

  it('cai no <img> com object URL quando createImageBitmap falha', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => { throw new Error('decode failed'); });
    stubImage({ width: 1080, height: 2340 });
    stubObjectUrl();
    const canvases = stubCanvas(() => 'data:image/jpeg;base64,ZmFsbGJhY2s=');

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('cupom.jpg', 'image/jpeg', JPEG_BYTES));

    expect(encoded.base64).toBe('ZmFsbGJhY2s=');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(canvases[0].height).toBe(1600); // retrato: limita a altura
  });

  it('comprime mais quando o primeiro passo ainda estoura o limite de envio', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 8160, height: 6120, close: () => { } }));
    let call = 0;
    const canvases = stubCanvas(() => {
      call += 1;
      return call === 1
        ? `data:image/jpeg;base64,${'A'.repeat(5_000_000)}`
        : 'data:image/jpeg;base64,cGVxdWVubw==';
    });

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('50mp.jpg', 'image/jpeg', JPEG_BYTES));

    expect(encoded.base64).toBe('cGVxdWVubw==');
    expect(canvases[0].width).toBe(1600);
    expect(canvases[1].width).toBe(1100); // segundo passo, mais agressivo
  });

  it('envia os bytes originais quando o navegador não decodifica (HEIC)', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => { throw new Error('unsupported'); });
    stubImage({ fail: true });
    stubObjectUrl();

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('IMG_0001.HEIC', '', HEIC_BYTES));

    expect(encoded.mimeType).toBe('image/heic');
    expect(encoded.base64).toBe(btoa(String.fromCharCode(...HEIC_BYTES)));
  });

  it('detecta o tipo pelos magic bytes quando o file.type vem vazio', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => { throw new Error('nope'); });
    stubImage({ fail: true });
    stubObjectUrl();

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('captura', '', PNG_BYTES));

    expect(encoded.mimeType).toBe('image/png');
  });

  it('não trava quando o canvas falha ao exportar a imagem', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 1080, height: 2340, close: () => { } }));
    stubImage({ fail: true });
    stubObjectUrl();
    stubCanvas(() => { throw new Error('out of memory'); });

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('grande.jpg', 'image/jpeg', JPEG_BYTES));

    expect(encoded.base64).toBe(btoa(String.fromCharCode(...JPEG_BYTES)));
    expect(encoded.mimeType).toBe('image/jpeg');
  });

  it('mantém PDFs sem passar pelo canvas', async () => {
    const createElementSpy = stubCanvas(() => 'data:image/jpeg;base64,x');

    const encoded = await AIReconcileService.encodeFileForAI(makeFile('nota.pdf', 'application/pdf', PDF_BYTES));

    expect(encoded.mimeType).toBe('application/pdf');
    expect(createElementSpy).toHaveLength(0);
  });

  it('rejeita com um Error de verdade quando a leitura do arquivo falha', async () => {
    // O bug original: o reject recebia o Event do DOM, então err.message vinha
    // undefined e o usuário só via a mensagem genérica "Erro ao processar cupons.".
    (globalThis as any).createImageBitmap = vi.fn(async () => { throw new Error('nope'); });
    stubImage({ fail: true });
    stubObjectUrl();
    stubFailingFileReader('NotReadableError');

    const err = await AIReconcileService.encodeFileForAI(makeFile('cupom.jpg', 'image/jpeg', JPEG_BYTES))
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('cupom.jpg');
    expect(err.message).toContain('NotReadableError');
  });
});

describe('processReceiptItems', () => {
  it('barra o envio antes do fetch quando o payload excede o limite da Vercel', async () => {
    // Dois arquivos que passam sozinhos, mas estouram somados.
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 1080, height: 2340, close: () => { } }));
    stubCanvas(() => `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`);
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    const files = [makeFile('a.jpg', 'image/jpeg', JPEG_BYTES), makeFile('b.jpg', 'image/jpeg', JPEG_BYTES)];
    const err = await AIReconcileService.processReceiptItems(files, 'user-1').then(() => null, (e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('limite de envio');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('traduz o 413 da Vercel (resposta em HTML, sem JSON) numa mensagem útil', async () => {
    (globalThis as any).createImageBitmap = vi.fn(async () => ({ width: 1080, height: 2340, close: () => { } }));
    stubCanvas(() => 'data:image/jpeg;base64,cGVxdWVubw==');
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => { throw new Error('not json'); },
    });

    const err = await AIReconcileService.processReceiptItems([makeFile('a.jpg', 'image/jpeg', JPEG_BYTES)], 'user-1')
      .then(() => null, (e) => e);

    expect(err.message).toContain('grandes demais');
  });
});
