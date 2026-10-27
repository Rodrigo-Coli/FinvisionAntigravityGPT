// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).__APP_VERSION__ = '2026.10.26.0100';

/**
 * "Atualizar agora" não pode apagar o app salvo no aparelho enquanto a
 * atualização ainda baixa, nem sem internet: era isso que deixava o app sem
 * abrir offline (avião) depois de atualizar.
 */
const sw = { updateServiceWorker: vi.fn(), setNeedRefresh: (_: boolean) => {} };
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => {
    const [needRefresh, setNeedRefresh] = useState(false);
    sw.setNeedRefresh = setNeedRefresh;
    return { offlineReady: [false, () => {}], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker: sw.updateServiceWorker };
  }
}));

import UpdateAlert from '../components/UpdateAlert';

let container: HTMLDivElement;
let root: Root;
const unregister = vi.fn();
const cachesDelete = vi.fn();
let registration: any;
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(() => {
  vi.useFakeTimers();
  unregister.mockReset(); cachesDelete.mockReset(); sw.updateServiceWorker.mockReset();
  registration = { unregister, update: vi.fn(async () => {}) };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: new Promise(() => {}),
      getRegistration: vi.fn(async () => registration),
      getRegistrations: vi.fn(async () => [registration]),
      controller: {}
    }
  });
  (globalThis as any).caches = { keys: vi.fn(async () => ['workbox-precache-v2']), delete: cachesDelete };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('version.json') ? { version: '2026.10.27.1200' } : { version: '2026.10.27.1200', title: 'Nova', changes: [] })
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); setOnline(true); });

const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const updateButton = () => Array.from(container.querySelectorAll('button')).find(b => /ATUALIZAR AGORA|Instalando/.test(b.textContent || ''))!;

describe('Atualizar agora sem quebrar o modo offline', () => {
  it('sem internet: não apaga nada e avisa que fica para depois', async () => {
    await act(async () => { root.render(<UpdateAlert />); });
    await flush();
    setOnline(false);
    await act(async () => { updateButton().click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    await flush();
    expect(container.textContent).toContain('Sem internet agora: a atualização fica para quando você estiver online.');
    expect(unregister).not.toHaveBeenCalled();
    expect(cachesDelete).not.toHaveBeenCalled();
  });

  it('atualização ainda baixando: espera terminar e troca de versão, sem apagar o cache', async () => {
    registration.installing = {};
    await act(async () => { root.render(<UpdateAlert />); });
    await flush();
    await act(async () => { updateButton().click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    await flush();
    expect(container.textContent).toContain('Baixando a atualização… mantenha o app aberto');
    await act(async () => { sw.setNeedRefresh(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await flush();
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(unregister).not.toHaveBeenCalled();
    expect(cachesDelete).not.toHaveBeenCalled();
  });
});
