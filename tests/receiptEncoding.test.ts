import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIReconcileService } from '../services/aiReconcile.service';

// Helpers ---------------------------------------------------------------

const toBase64 = (bytes: number[]) =>
  btoa(String.fromCharCode(...bytes));

const pad = (bytes: number[]) => bytes.concat(new Array(Math.max(0, 32 - bytes.length)).fill(0));

const JPEG = toBase64(pad([0xff, 0xd8, 0xff, 0xe0]));
const PNG = toBase64(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const HEIC = toBase64(pad([0, 0, 0, 0x18, ...'ftypheic'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c))));

const fakeFile = (name: string, type: string) => ({ name, type } as unknown as File);

/** FileReader que resolve com a data URL informada, ou dispara onerror. */
function stubFileReader(behavior: { dataUrl?: string; fail?: boolean; errorName?: string }) {
  class FakeFileReader {
    result: string | null = null;
    error: any = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL() {
      setTimeout(() => {
        if (behavior.fail) {
          this.error = { name: behavior.errorName || 'NotReadableError' };
          this.onerror?.();
        } else {
          this.result = behavior.dataUrl ?? null;
          this.onload?.();
        }
      }, 0);
    }
  }
  (globalThis as any).FileReader = FakeFileReader;
}

/** Image que sempre falha ao decodificar (comportamento de HEIC no navegador). */
function stubImage(behavior: { fail?: boolean; width?: number; height?: number }) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = behavior.width ?? 800;
    height = behavior.height ?? 600;
    set src(_v: string) {
      setTimeout(() => (behavior.fail ? this.onerror?.() : this.onload?.()), 0);
    }
  }
  (globalThis as any).Image = FakeImage;
}

function stubCanvas(toDataURL: () => string) {
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => { } }),
      toDataURL,
    } as any;
  }) as any);
}

const originalFileReader = (globalThis as any).FileReader;
const originalImage = (globalThis as any).Image;

afterEach(() => {
  (globalThis as any).FileReader = originalFileReader;
  (globalThis as any).Image = originalImage;
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------

describe('encodeFileForAI', () => {
  it('rejeita com um Error de verdade quando a leitura do arquivo falha', async () => {
    stubFileReader({ fail: true, errorName: 'NotReadableError' });

    // O bug original: o reject recebia o Event do DOM, então err.message vinha
    // undefined e o usuário só via a mensagem genérica "Erro ao processar cupons.".
    const err = await AIReconcileService.encodeFileForAI(fakeFile('cupom.jpg', 'image/jpeg'))
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('cupom.jpg');
    expect(err.message).toContain('NotReadableError');
  });

  it('rejeita com mensagem clara quando o arquivo vem vazio', async () => {
    stubFileReader({ dataUrl: '' });

    const err = await AIReconcileService.encodeFileForAI(fakeFile('vazio.jpg', 'image/jpeg'))
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('vazio.jpg');
  });

  it('envia os bytes originais quando o navegador não decodifica a imagem (HEIC)', async () => {
    stubFileReader({ dataUrl: `data:;base64,${HEIC}` });
    stubImage({ fail: true });

    const encoded = await AIReconcileService.encodeFileForAI(fakeFile('IMG_0001.HEIC', ''));

    expect(encoded.mimeType).toBe('image/heic');
    expect(encoded.base64).toBe(HEIC);
  });

  it('detecta o tipo pelos magic bytes quando o file.type vem vazio', async () => {
    stubFileReader({ dataUrl: `data:;base64,${PNG}` });
    stubImage({ fail: true });

    const encoded = await AIReconcileService.encodeFileForAI(fakeFile('captura', ''));

    expect(encoded.mimeType).toBe('image/png');
  });

  it('não trava quando o canvas falha ao exportar a imagem', async () => {
    stubFileReader({ dataUrl: `data:image/jpeg;base64,${JPEG}` });
    stubImage({});
    stubCanvas(() => { throw new Error('out of memory'); });

    const encoded = await AIReconcileService.encodeFileForAI(fakeFile('grande.jpg', 'image/jpeg'));

    expect(encoded.base64).toBe(JPEG);
    expect(encoded.mimeType).toBe('image/jpeg');
  });

  it('comprime a imagem em JPEG quando o canvas funciona', async () => {
    stubFileReader({ dataUrl: `data:image/png;base64,${PNG}` });
    stubImage({ width: 4000, height: 3000 });
    stubCanvas(() => 'data:image/jpeg;base64,Y29tcHJlc3NlZA==');

    const encoded = await AIReconcileService.encodeFileForAI(fakeFile('foto.png', 'image/png'));

    expect(encoded.mimeType).toBe('image/jpeg');
    expect(encoded.base64).toBe('Y29tcHJlc3NlZA==');
  });

  it('mantém PDFs sem passar pelo canvas', async () => {
    stubFileReader({ dataUrl: `data:application/pdf;base64,${toBase64(pad([0x25, 0x50, 0x44, 0x46]))}` });

    const encoded = await AIReconcileService.encodeFileForAI(fakeFile('nota.pdf', 'application/pdf'));

    expect(encoded.mimeType).toBe('application/pdf');
  });
});

describe('processReceiptItems', () => {
  beforeEach(() => {
    stubFileReader({ dataUrl: `data:image/jpeg;base64,${JPEG}` });
    stubImage({});
    stubCanvas(() => `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`);
  });

  it('barra o envio antes do fetch quando o payload excede o limite da Vercel', async () => {
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    const files = [fakeFile('a.jpg', 'image/jpeg'), fakeFile('b.jpg', 'image/jpeg')];
    const err = await AIReconcileService.processReceiptItems(files, 'user-1')
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('limite de envio');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('traduz o 413 da Vercel (resposta em HTML, sem JSON) numa mensagem útil', async () => {
    stubCanvas(() => `data:image/jpeg;base64,${JPEG}`);
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => { throw new Error('not json'); },
    });

    const err = await AIReconcileService.processReceiptItems([fakeFile('a.jpg', 'image/jpeg')], 'user-1')
      .then(() => null, (e) => e);

    expect(err.message).toContain('grandes demais');
  });
});
