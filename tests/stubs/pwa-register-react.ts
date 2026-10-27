// Módulo virtual do vite-plugin-pwa não existe nos testes; cada teste faz vi.mock dele.
export const useRegisterSW = (_?: unknown) => ({
  offlineReady: [false, () => {}],
  needRefresh: [false, () => {}],
  updateServiceWorker: async (_reload?: boolean) => {}
});
