# Tarefas de Estabilização - Arquitetura Standalone

- [x] Criar backup de segurança
- [x] Criar 11 arquivos standalone na raiz `/api/`:
    - [x] `finvision-chat.ts`
    - [x] `categorize-transactions.ts`
    - [x] `process-import.ts`
    - [x] `handle-wealth-analysis.ts`
    - [x] `handle-bank-reconcile.ts`
    - [x] `handle-card-reconcile.ts`
    - [x] `asaas-webhook.ts`
    - [x] `whatsapp-webhook.ts`
    - [x] `notify-bills-due.ts`
    - [x] `parse-card-statement.ts`
    - [x] `parse-statement.ts`
- [x] Fase 4: Otimização da Conciliação Inteligente & Polling em Background
    - [x] Remover `gemini-2.5-pro` do loop de fallbacks no `handle-bank-reconcile.ts`
    - [x] Remover `gemini-2.5-pro` do loop de fallbacks no `handle-card-reconcile.ts`
    - [x] Implementar auto-retomada de polling em segundo plano no `fetchRecentImports` em `Reconcile.tsx`
    - [x] Executar verificação de compilação com `npx tsc --noEmit`
    - [x] Realizar o deploy com `.\deploy_antigravity.ps1`
    - [x] Atualizar o `walkthrough.md` com as novas correções
- [x] **Fase 6: Conciliação Inteligente & Segregação de Filas**
    - [x] Resolver falha na confirmação de cartões em `Reconcile.tsx` (corrigindo `targetId` e `effectiveIsCard`).
    - [x] Segregar as filas de conciliação (Banco, Cartão e Diversos) em `Reconcile.tsx` com base no tipo da transação importada.
    - [x] Executar verificação de compilação com `npx tsc --noEmit`
    - [x] Realizar o deploy com `.\deploy_antigravity.ps1`
    - [x] Atualizar o `walkthrough.md` com as novas correções
- [x] Simplificar `api/index.ts` (Remover os 11 handlers migrados)
- [x] Atualizar `vercel.json` com roteamento explícito
- [x] Trigger immediate sync of existing fixes to Production
- [x] Refatorar AddTransactionModal.tsx
    - [x] Alterar inputMode para "text" e permitir valor direto sem replace de "-"
    - [x] Atualizar onChange para aceitar "-" e auto-selecionar tipo despesa/receita
- [x] Sincronizar o botão de toggle e dropdown para atualizar o sinal no input
- [x] Refatorar TransactionTable.tsx
    - [x] Ajustar input de edição mobile: inputMode="text", permitir "-" no input e onChange
    - [x] Ajustar input de edição desktop: inputMode="text", permitir "-" no input e onChange
- [x] Validação
    - [x] Compilar o projeto com TypeScript (`npx tsc --noEmit`) para garantir que não há erros de tipos.
- [x] Update Service Worker (`src/sw.js`) with `matchPrecache` to fix startup navigation crash offline.
- [x] Implement local storage fallbacks in Dashboard (`pages/Home.tsx`) for summary, projections, and bank transactions.
- [x] Implement local storage fallbacks in Accounts (`pages/Accounts.tsx`) and add `'offline-sync-completed'` listener.
- [x] Implement local storage fallbacks in Credit Cards (`pages/CreditCards.tsx`) for cards, categories, subcategories, accounts, owners, statements, and transactions; add `'offline-sync-completed'` listener.
- [x] Refine `History.tsx` to show future provisions in the "Current Month" view
- [x] Fix all numerical inputs in `CreditCards.tsx` and `ManualTransactionModal.tsx` to handle empty strings
- [x] Final verification in browser (Logic confirmed & successfully built PWA assets)
- [x] Final Production Sync
- [x] Validar integridade das rotas (Vercel Deploy)

- [x] Step 7: Verify all changes and build the application using `npx tsc --noEmit`.
- [x] Step 8: Revamp `downloadEvolutionMedia` with direct message forwarding and S3 fallback in `whatsapp-webhook.ts`.
- [x] Step 9: Refactor daily reminder formatting with accounts and details in `notify-bills-due.ts`.
- [x] Step 10: Run final verification using `npx tsc --noEmit` and deploy to production.

- [x] **Fase 7: Correção de Erros Críticos de Conciliação de Cartão (7732)**
    - [x] Diagnosticar causa raiz: Erro de sintaxe de UUID em `category_id` (string vazia `""` lançando erro no PostgreSQL).
    - [x] Corrigir tipo de UUID no insert de `card_transactions` em `Reconcile.tsx` para passar `finalCategoryId || null`.
    - [x] Corrigir desalinhamento dos campos de IPTU e condomínio na Evolução do modal de detalhes
- [x] Validar build, fazer deploy e atualizar `walkthrough.md`

## Fase 3: Correção de Erro de Exclusão de Ativos
- [x] Corrigir erro de sintaxe JSON (`invalid input syntax for type json`) nas queries Supabase/PostgREST em `components/assets/RealEstateDetailModal.tsx` substituindo o operador `->` por `->>`
- [x] Validar compilação do TypeScript, executar testes e realizar deploy

## Fase 7: Estender Ações do Cabeçalho ao Extrato de Bens Físicos (`pages/Assets.tsx`)
- [x] Importar `XLSX` e os ícones `FileSpreadsheet` e `Printer` em `pages/Assets.tsx`
- [x] Renderizar botões circulares de Excel, PDF, Arquivar e Excluir no cabeçalho do `showExtratoModal`
- [x] Implementar a função `exportExtratoToExcel` e a ação de Arquivar a partir do extrato (`handleArchiveAssetFromExtrato`)
- [x] Corrigir Layout de Sumário Financeiro no Extrato (`pages/Assets.tsx`)
  - [x] Tornar o sumário responsivo usando `grid grid-cols-1 sm:grid-cols-3`
  - [x] Alinhar elementos no mobile (título à esquerda e valor à direita) para evitar sobreposição
- [x] Ajustar Padrão de Descrições e Categorias de Vendas de Ativos
  - [x] Ajustar descrições de venda de veículos no `pages/Assets.tsx` para colocar o nome primeiro
  - [x] Ajustar descrições de venda de imóveis no `RealEstateDetailModal.tsx` para colocar o nome primeiro
  - [x] Substituir categoria `'Outras Receitas'` por **`'Venda de Ativos'`** com subcategorias específicas (`'Venda de Imóvel'`, `'Venda de Veículo'`, `'Venda de Bem Físico'`)
- [x] Implementar Vínculo e Ajuste Retroativo de Permutas
  - [x] Adicionar `permuta_origem_asset_id` e `permuta_original_value` no metadata dos bens físicos criados a partir de permutas de veículos (`pages/Assets.tsx`)
  - [x] Adicionar `permuta_origem_asset_id` e `permuta_original_value` no metadata dos bens físicos criados a partir de permutas de imóveis (`RealEstateDetailModal.tsx`)
  - [x] Implementar atualização do ativo principal e suas transações de receita na venda de um imóvel recebido em permuta (`RealEstateDetailModal.tsx`)
  - [x] Implementar atualização do ativo principal e suas transações de receita na venda de um veículo/outro bem recebido em permuta (`pages/Assets.tsx`)
- [x] Validação Geral
  - [x] Rodar `npx tsc --noEmit` para garantir conformidade de tipos
  - [x] Atualizar o `walkthrough.md` com a nova entrega

## Fase 6: Correção de Notificações, Série de Patrimônio e Deslocamento Relativo de Datas
- [x] Implementar função helper `buildSeriesFilter` no `pages/History.tsx`
- [x] Refatorar a ação de atualizar (`handleUpdate`) em lote no `pages/History.tsx` para tratar data com deslocamento relativo de meses e clipagem de dias
- [x] Refatorar a ação de excluir (`handleDelete`) em lote no `pages/History.tsx` para usar o novo filtro de série de patrimônio
- [x] Validar a compilação com `npx tsc --noEmit`
- [x] Realizar deploy de todos os arquivos usando o script completo `deploy_antigravity.ps1`
- [x] Atualizar walkthrough.md com as modificações realizadas e resultados dos testes

## Fase 8: Sincronização de Saldos e Melhoria no Botão Novo Ativo
- [x] Garantir que o "Ajuste Manual de Saldo" (handleSaveAdjustment) para contas INVESTMENT não sobreponha dados mantidos pelo sync automático
- [x] Ajustar modal de contas com banner explicativo e renomear tab de Saldo Inicial para Caixa Livre nas contas INVESTMENT
- [x] Atualizar comportamento do botão '+' de Novo Ativo na barra superior para abrir diretamente o formulário da categoria da aba ativa
- [x] Validar compilação com `npm run build`
- [x] Realizar o deploy no repositório GitHub via `deploy_antigravity.ps1`

## Tarefas: Otimização do Tempo de Resposta do WhatsApp
- [x] Modificar o prompt do classificador em `whatsapp-webhook.ts` para gerar `chatReply` e regras de conversa.
- [x] Atualizar `handleInteractiveFinancialQuery` para aceitar e utilizar datas pré-extraídas.
- [x] Passar as datas pré-extraídas na chamada de `handleInteractiveFinancialQuery` em `handleWhatsAppWebhook`.
- [x] Otimizar o fluxo do `CHAT` em `handleWhatsAppWebhook` para usar o `op.chatReply` pré-gerado.
- [x] Executar testes unitários locais (`npm run test`).
- [x] Sincronizar as alterações locais com o repositório de produção no GitHub. via `deploy_antigravity.ps1`

## Fase 9: Correção de Datas de Parcelas Recorrentes e Regra de Fevereiro
- [x] Investigar e corrigir bug de timezone/formatação na edição de parcelas que alterava datas de vencimento em outros meses (ex: dia 30 em julho virando 29)
- [x] Implementar regra de vencimento em Fevereiro: se o vencimento for dia 29, 30 ou 31, deve ser antecipado para dia 28 em todos os anos (incluindo bissextos)
- [x] Garantir comportamento consistente tanto na geração inicial da série (`transactionSeriesUtils.ts`) quanto na edição em lote do histórico (`History.tsx`)
- [x] Adicionar testes unitários para validar a regra de geração de datas em séries e cobertura do comportamento de Fevereiro
- [x] Validar compilação e testes com `npm run build`
- [x] Realizar deploy com `deploy_antigravity.ps1`

## Fase 11: Unificação de Contas Bancárias & Cartões de Crédito
- [x] Criar diretório de backup `backups/backup_20260615_banking_unification` e salvar arquivos originais
- [x] Criar os componentes `components/banking/AccountsSection.tsx` e `components/banking/CreditCardsSection.tsx`
- [x] Criar a página unificada `pages/Banking.tsx` com navegação por abas
- [x] Remover os arquivos legados `pages/Accounts.tsx` e `pages/CreditCards.tsx`
- [x] Atualizar roteamento e redirecionamentos legados em `App.tsx`
- [x] Simplificar as opções em `components/Nav.tsx` e `components/BottomNav.tsx`
- [x] Executar type-check (`npx tsc --noEmit`) com zero erros
- [/] Realizar deploy utilizando `atomic_deploy.ps1`

## Fase 10: Implementação das Recomendações dos Especialistas (Investimentos e Empréstimos)
- [ ] Implementar parser de taxa anualizada de renda fixa e conversão para taxa mensal equivalente
- [ ] Implementar cálculo de juros compostos retroativos e futuros nos investimentos
- [ ] Implementar cálculo regressivo do Imposto de Renda (22.5% a 15.0%) baseado em dias, exibindo Bruto vs Líquido
- [ ] Renderizar filtros interativos de Liquidez e Prazo/Vencimento na aba de Investimentos
- [ ] Renderizar gráfico de pizza/donut em SVG e barra de alocação por risco na aba de Investimentos
- [ ] Criar modal exclusivo `showLoanModal` para cadastro/edição de Empréstimos Concedidos
- [ ] Mover seção de Empréstimos Concedidos para o fim da página, abaixo das Corretoras
- [ ] Implementar tabela de amortização teórica (SAC e Price) no extrato detalhado do empréstimo
- [ ] Adicionar testes unitários em `tests/financial.test.ts` para as taxas, IR regressivo e Price/SAC
- [ ] Validar compilação/testes com `npm run build`
- [ ] Realizar deploy com `deploy_antigravity.ps1`

## Fase 12: Auditoria e Correções no Módulo de Transações (Histórico)
- [x] Corrigir falha silenciosa de edição e exclusão de lançamentos de cartão de crédito no histórico (`pages/History.tsx`)
- [x] Corrigir desalinhamento de valores contábeis na edição de transferências de dupla entrada (`pages/History.tsx`)
- [x] Sincronizar cache local no `localStorage` imediatamente após atualizações no histórico (`pages/History.tsx`)
- [x] Ajustar tipografia (`font-mono tabular-nums`) e expandir área de toque dos botões na tabela de transações (`components/history/TransactionTable.tsx`)
- [x] Implementar validação de valor mínimo (R$ 0 ou em branco) ao criar transações (`components/history/AddTransactionModal.tsx`)
- [x] Adicionar suporte a ações de cartões (`UPDATE_CARD_TRANSACTION` e `DELETE_CARD_TRANSACTION`) na fila offline (`lib/offlineQueue.service.ts`)
- [x] Validar build da aplicação (`npx tsc --noEmit`)
- [x] Realizar deploy atômico para o repositório GitHub via `deploy_now.ps1`

## Fase 13: Ajustes e Correções no Módulo Insight AI (Labs)
- [x] Corrigir bug do modo parcial no cupom adicionando input numérico dinâmico (`pages/AIModule.tsx`)
- [x] Adicionar dropdown de categoria e propagar `categoryId` no insert do cartão de crédito (`pages/AIModule.tsx`, `services/aiReconcile.service.ts`)
- [x] Corrigir bug de ordenação cronológica de preços unitários no comparador (`pages/AIModule.tsx`)
- [x] Persistir a Lista de Compras no localStorage, com checkboxes de check-off, WhatsApp share e confirmação de limpeza (`pages/AIModule.tsx`)
- [x] Calcular dinamicamente a variabilidade média da inflação pessoal (`pages/AIModule.tsx`)
- [x] Corrigir renderização semântica do Markdown no diagnóstico patrimonial (WCAG AA) (`pages/AIModule.tsx`)
- [x] Atualizar alíquota do IOF internacional padrão para 2.38% (2026) (`pages/Settings.tsx`, `services/aiReconcile.service.ts`)
- [x] Implementar cache local e suporte offline para comparação de preços (`pages/AIModule.tsx`)
- [x] Validar build da aplicação com typecheck (`npx tsc --noEmit`)
- [x] Realizar deploy atômico para o repositório GitHub via `deploy_now.ps1`

## Fase 14: Ajustes e Estabilização no Módulo de Conciliação Inteligente
- [x] Corrigir gravação de `paid_amount` na inserção de transações conciliadas (`pages/Reconcile.tsx`)
- [x] Padronizar gravação de `owner_name` para passar `null` se for "Pessoal" (`pages/Reconcile.tsx`)
- [x] Adicionar invalidação do cache de histórico do localStorage após confirmações (`pages/Reconcile.tsx`)
- [x] Corrigir bug de switch automático de abas ao selecionar conta de destino na aba Diversos (`pages/Reconcile.tsx`)
- [x] Adicionar `aria-label` e melhorar touch targets e contraste das datas (WCAG AA) (`pages/Reconcile.tsx`)
- [x] Aplicar classes `font-mono tabular-nums text-right` nos preços (`pages/Reconcile.tsx`)
- [x] Validar build da aplicação com typecheck (`npx tsc --noEmit`)
- [x] Realizar deploy atômico para o repositório GitHub via `deploy_now.ps1`

## Fase 15: Melhoria na Detecção de Duplicidades no Conciliar
- [x] Modificar `checkDuplicates` em `statement-template-helper.ts` com normalização de nomes e suporte a `duplicate_tx`
- [x] Atualizar `handle-bank-reconcile.ts` para salvar `duplicate_tx` na coluna `metadata`
- [x] Atualizar `handle-card-reconcile.ts` para salvar `duplicate_tx` na coluna `metadata`
- [x] Atualizar `handle-import-worker.ts` para salvar `duplicate_tx` na coluna `metadata`
- [x] Atualizar `process-import.ts` para salvar `duplicate_tx` na coluna `metadata`
- [x] Modificar o card de transações no Conciliar em `pages/Reconcile.tsx` para mostrar o lançamento correspondente encontrado
- [/] Executar testes unitários locais (`npm run test`)
- [/] Validar compilação do TypeScript (`npx tsc --noEmit`)
- [ ] Sincronizar as alterações locais com o repositório de produção no GitHub via `sync_deploy.ps1`
