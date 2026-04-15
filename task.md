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
- [x] Simplificar `api/index.ts` (Remover os 11 handlers migrados)
- [x] Atualizar `vercel.json` com roteamento explícito
- [ ] Validar integridade das rotas (Vercel Deploy)
