# Zyvion / FinVision — regras do repositório

## Toda entrega que muda o app publica versão nova com as notas DO QUE MUDOU

O aviso "Atualizar agora" que o usuário vê no celular é montado a partir de
três arquivos. Se o código muda e eles não, o aviso repete as novidades da
versão anterior — o que já aconteceu mais de uma vez e confunde o usuário.

No MESMO PR da mudança (nunca "depois"):

1. `public/version.json` → `{"version": "AAAA.MM.DD.HHMM"}` com a data/hora
   atual de Brasília (`TZ=America/Sao_Paulo date +%Y.%m.%d.%H%M`). Sempre maior
   que a anterior.
2. `public/changelog.json` → mesma `version`; `date` = `DD/MM/AAAA` da versão;
   `title` e `benefits` descrevendo, em linguagem do usuário, SÓ o que este PR
   muda; `changes` com o detalhe técnico.
3. `public/changelog-history.json` → o mesmo objeto do changelog.json no topo
   da lista (mais novo primeiro).

Se o PR ganhar mais commits antes do merge, reescreva as notas para cobrir o
PR inteiro (e atualize a hora da versão).

Travas que existem para isso:
- `tests/releaseNotes.test.ts` (roda no `npm run build` da Vercel): versão,
  changelog e histórico têm de bater entre si, senão o deploy falha.
- `.github/workflows/release-notes.yml`: PR para a main que muda o app sem
  atualizar os três arquivos (ou sem aumentar a versão) fica vermelho. Não
  faça merge com essa checagem vermelha.
- `components/UpdateAlert.tsx`: se as notas não forem da versão do servidor,
  o aviso mostra um texto genérico em vez de notas antigas.

Mudanças só em `docs/`, `tests/`, `.github/`, `supabase/` ou `*.md` não
precisam de versão nova.

## Verificação

- `npm test` (vitest). `tests/connectivity.test.ts` pode falhar em sandbox sem
  rede; na Vercel passa.
- `npx tsc -p tsconfig.json --noEmit` e `npx vite build`.
