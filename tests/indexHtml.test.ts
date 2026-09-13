import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '..');
const html = readFileSync(resolve(raiz, 'index.html'), 'utf-8');

/**
 * Guardas do index.html — cada uma marca um bug que já chegou ao usuário.
 * São testes de texto de propósito: o arquivo é a porta de entrada do site e
 * uma linha errada aqui derruba o app inteiro antes de qualquer código rodar.
 */
describe('index.html', () => {
  it('não escreve em document.body.innerHTML', () => {
    // Havia um depurador que fazia `document.body.innerHTML += ...` a cada erro
    // de script. Reatribuir o innerHTML do body reparseia o documento inteiro: o
    // React perde os nós onde escuta os cliques e a página fica "olhando mas não
    // clicando". No iPhone bastava um erro qualquer no início para o site
    // inteiro parar de responder ao toque.
    expect(html).not.toMatch(/document\.body\.innerHTML/);
  });

  it('não carrega o Tailwind por CDN de execução', () => {
    // A CDN era um <script> de terceiro SÍNCRONO no <head>: segurava a primeira
    // pintura, e se não respondesse o site abria sem nenhum estilo — inclusive
    // offline, porque a CDN está fora do service worker. O CSS agora é gerado no
    // build (tailwind.config.js + src/index.css).
    expect(html).not.toMatch(/cdn\.tailwindcss\.com/);
  });

  it('as fontes externas não bloqueiam a primeira pintura', () => {
    // Medido: com a folha do Google Fonts como <link rel="stylesheet"> comum, uma
    // rede que não respondia deixou a tela EM BRANCO por 12,5s. Com media="print"
    // + onload o navegador baixa sem bloquear e aplica quando chega.
    const linksDeFonte = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || [];
    expect(linksDeFonte.length).toBeGreaterThan(0);

    const bloqueantes = linksDeFonte.filter(
      tag => tag.includes('rel="stylesheet"') && !tag.includes('media="print"')
    );
    // O único aceitável é o de dentro do <noscript>, que só vale sem JavaScript.
    for (const tag of bloqueantes) {
      const posicao = html.indexOf(tag);
      const antes = html.slice(0, posicao);
      const dentroDeNoscript =
        antes.lastIndexOf('<noscript>') > antes.lastIndexOf('</noscript>');
      expect(dentroDeNoscript).toBe(true);
    }
  });

  it('mantém o marcador que o Vite usa para injetar o script do app', () => {
    // O comentário de tráfego pago já quebrou o site uma vez por conter a
    // sequência de fechamento do <head>. Se houver mais de um fechamento, o Vite
    // injeta no lugar errado.
    expect(html.match(/<\/head>/g)?.length).toBe(1);
  });
});

describe('build do Tailwind', () => {
  const config = readFileSync(resolve(raiz, 'tailwind.config.js'), 'utf-8');
  const css = readFileSync(resolve(raiz, 'src/index.css'), 'utf-8');

  it('varre index.html além do código — o <body> usa classes do Tailwind', () => {
    expect(config).toMatch(/'\.\/index\.html'/);
  });

  it('mantém a paleta da marca e o dark mode por classe', () => {
    expect(config).toMatch(/darkMode:\s*'class'/);
    expect(config).toMatch(/#0A1F44/); // brand-900
    expect(config).toMatch(/#2D7FF9/); // brand-500
  });

  it('a folha de entrada traz as diretivas do Tailwind', () => {
    expect(css).toMatch(/@tailwind base;/);
    expect(css).toMatch(/@tailwind components;/);
    expect(css).toMatch(/@tailwind utilities;/);
  });

  it('preserva os utilitários próprios que o app usa em classe fixa', () => {
    // Estes vivem em CSS puro (não são gerados pelo Tailwind) e são usados por
    // nome em vários lugares: se sumirem, o layout quebra sem erro nenhum.
    for (const classe of [
      '--offline-banner-h',
      '.main-content-safe',
      '.below-offline-banner',
      '.sidebar-below-offline-banner',
      '.mobile-header-safe',
      '.pb-safe',
      '.scrollbar-hide',
      '.glass',
      '.text-gradient'
    ]) {
      expect(css).toContain(classe);
    }
  });
});

describe('nenhuma classe do Tailwind montada em tempo de execução', () => {
  it('não existe `bg-${...}` e afins no código das telas', async () => {
    // O Tailwind compilado só gera o que consegue LER no código-fonte. Uma classe
    // montada por pedaços (`bg-${cor}-50`) não existe no CSS final e o elemento
    // fica sem estilo — silenciosamente. Este era o caso do painel do admin.
    const { globSync } = await import('node:fs');
    const arquivos = (globSync as any)('{pages,components}/**/*.tsx', { cwd: raiz }) as string[];

    const infratores: string[] = [];
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(resolve(raiz, arquivo), 'utf-8');
      const achados = conteudo.match(/(?:bg|text|border|from|via|to|ring|fill|stroke|shadow)-\$\{/g);
      if (achados) infratores.push(`${arquivo} (${achados.length})`);
    }

    expect(infratores).toEqual([]);
  });
});
