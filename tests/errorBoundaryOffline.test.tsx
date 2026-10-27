// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ErrorBoundary, { isChunkLoadError } from '../components/ErrorBoundary';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Tela que não foi salva no aparelho, aberta sem internet: mensagem clara e volta ao início sem recarregar. */
let container: HTMLDivElement;
let root: Root;
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
let shouldThrow = true;
const Screen = () => {
  if (shouldThrow) throw new TypeError('Failed to fetch dynamically imported module: https://finvision.automanow.com.br/assets/Banking-DjBuCH8V.js');
  return <p>Início</p>;
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); setOnline(true); vi.restoreAllMocks(); });

describe('erro de tela não baixada', () => {
  it('reconhece a falha de baixar parte do app', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Banking-x.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('sem internet: explica e volta ao início sem recarregar a página', async () => {
    setOnline(false);
    shouldThrow = true;
    window.location.hash = '#/banking?tab=cards&add=true';
    await act(async () => { root.render(<ErrorBoundary><Screen /></ErrorBoundary>); });
    expect(container.textContent).toContain('Sem internet');
    expect(container.textContent).toContain('ainda não foi salva no aparelho');
    shouldThrow = false;
    const home = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Voltar ao início'))!;
    await act(async () => { home.click(); });
    expect(window.location.hash).toBe('#/');
    expect(container.textContent).toContain('Início');
  });
});
