
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// ErrorBoundary aqui fora (não só dentro do JSX do App) — App.tsx roda hooks
// (useState/useEffect) ANTES de retornar seu próprio JSX, e um ErrorBoundary
// só protege a árvore que ele envolve. Sem isso, um erro não tratado nos
// hooks do próprio App (ex.: localStorage bloqueado pelo navegador) derrubava
// a tela inteira sem nenhuma tela de erro amigável.
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);


