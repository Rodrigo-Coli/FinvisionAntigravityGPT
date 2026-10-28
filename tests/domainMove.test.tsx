// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { shouldAutoRedirect, officialUrlFor, isOldHost, pendingOfflineCount } from '../lib/domainMove';
import DomainMoveBanner from '../components/DomainMoveBanner';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('endereço antigo → zyvion.automanow.com.br', () => {
  const base = { hostname: 'finvision.automanow.com.br', standalone: false, online: true, pendingOffline: 0 };
  it('no navegador, online e sem fila offline: redireciona para a mesma tela', () => {
    expect(shouldAutoRedirect(base)).toBe(true);
    expect(officialUrlFor({ pathname: '/', search: '?ref=ABC', hash: '#/banking?tab=cards&add=true' }))
      .toBe('https://zyvion.automanow.com.br/?ref=ABC#/banking?tab=cards&add=true');
  });
  it('não redireciona: endereço oficial, app instalado, sem internet ou com lançamentos esperando envio', () => {
    expect(shouldAutoRedirect({ ...base, hostname: 'zyvion.automanow.com.br' })).toBe(false);
    expect(shouldAutoRedirect({ ...base, hostname: 'finvision-antigravity-gpt.vercel.app' })).toBe(false);
    expect(shouldAutoRedirect({ ...base, standalone: true })).toBe(false);
    expect(shouldAutoRedirect({ ...base, online: false })).toBe(false);
    expect(shouldAutoRedirect({ ...base, pendingOffline: 2 })).toBe(false);
    expect(isOldHost('FINVISION.automanow.com.br')).toBe(true);
  });
  it('conta a fila offline (pendentes + falhas)', () => {
    localStorage.setItem('finvision_offline_queue', JSON.stringify([{ id: 1 }, { id: 2 }]));
    localStorage.setItem('finvision_offline_failed', JSON.stringify([{ id: 3 }]));
    expect(pendingOfflineCount()).toBe(3);
    localStorage.clear();
    expect(pendingOfflineCount()).toBe(0);
  });
  it('fora do endereço antigo o aviso não aparece', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => { root.render(<DomainMoveBanner />); });
    expect(div.textContent).toBe(''); // jsdom roda em localhost
    act(() => root.unmount());
  });
});
