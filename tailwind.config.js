/**
 * Configuração do Tailwind — a mesma que vivia dentro do index.html
 * ----------------------------------------------------------------
 * O app carregava o Tailwind pela CDN de execução (`cdn.tailwindcss.com`), que
 * gera o CSS no navegador do usuário a cada abertura. Isso custava caro:
 *
 *  - era um `<script>` de terceiro, SÍNCRONO, no meio do `<head>`: o navegador
 *    parava de montar a página até baixar e executar ~380 KB — no celular em 4G
 *    isso são segundos antes de aparecer qualquer coisa;
 *  - se a CDN não respondesse (rede ruim, rede corporativa, país bloqueado), o
 *    site inteiro abria SEM NENHUM ESTILO;
 *  - e, principalmente, OFFLINE o app também ficava sem estilo, porque a CDN
 *    está fora do cache do service worker — um app que se propõe a funcionar
 *    sem internet abria desmontado.
 *
 * Agora o CSS é gerado no build: um arquivo enxuto (só as classes realmente
 * usadas), servido do mesmo domínio, com cache e dentro do service worker.
 */
export default {
  darkMode: 'class',
  // index.html entra na lista: o <body> usa classes do Tailwind direto no HTML.
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Outfit"', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#F3F6FB',
          100: '#c1ecfd',
          200: '#8de2fe',
          300: '#38D8FF',
          400: '#3eb0fd',
          500: '#2D7FF9',
          600: '#2362c2',
          700: '#1b4a96',
          800: '#123268',
          900: '#0A1F44',
          950: '#0e1428',
        },
      },
      animation: {
        'scan': 'scan 2s linear infinite',
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 15s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    }
  },
  plugins: []
}
