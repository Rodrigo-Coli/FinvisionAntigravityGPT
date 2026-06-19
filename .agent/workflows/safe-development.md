---
description: Fluxo de Desenvolvimento Seguro com Backup espelhado
---

Este workflow define o processo de alteração de código para garantir que sempre tenhamos um estado estável e aprovado disponível no diretório `_backup_original`.

### Processo de Alteração
1. **Proposta**: O assistente propõe as alterações ao usuário.
2. **Aprovação**: O assistente **DEVE** aguardar a confirmação explícita do usuário (ex: "concordo", "pode aplicar", "aprovado").
3. **Aplicação Dupla**:
   - Aplicar a alteração no arquivo original dentro da pasta `pages/`, `components/`, etc.
   - Refletir a **mesma** alteração no arquivo correspondente dentro da pasta `_backup_original/`.
4. **Teste Obrigatório (Localhost)**:
   - Antes de declarar que a funcionalidade está pronta, o assistente **DEVE** utilizar as ferramentas de navegação (`browser_subagent`) para testar o comportamento no `http://localhost:5050` (ou porta ativa).
   - O teste deve simular a ação do usuário (cliques, preenchimento de formulários) e verificar se há erros no console.
5. **Sincronização**: Executar o script de deploy/sync (`sync_ultra_v2.ps1`) para atualizar o ambiente de visualização.

### Regra de Ouro
- O diretório `_backup_original` nunca deve conter código que não tenha sido explicitamente "concordado" pelo usuário. Ele serve como o ponto de restauração imediata caso uma nova iteração não atenda às expectativas.
- **Não concluir sem testar**: É terminantemente proibido dizer "está pronto" ou "corrigido" sem antes realizar uma ronda de testes funcionais via browser no localhost, exceto para funcionalidades que dependem exclusivamente de hardware externo ou importações de arquivos físicos (embora testes com dados já existentes devam ser feitos).

### Protocolo de Validação Técnica (Assertividade)
Para cumprir o objetivo de ser mais assertivo e reduzir erros de "coluna não encontrada":
1. **Verificação de Schema**: Antes de escrever qualquer comando de `insert`, `update` ou `select` via Supabase, o assistente **DEVE** buscar o nome das colunas nos arquivos `.sql` locais (especialmente `supabase/master_migration.sql` e `supabase/schema_full.sql`).
2. **Paridade de Tipos**: Garantir que as interfaces no `types.ts` (ou equivalentes) estejam sincronizadas com o código do componente e com o banco de dados.
3. **Mapeamento Explícito**: Evitar o uso do operador spread (`...item`) em inserções críticas, preferindo o mapeamento explícito de campos para capturar erros de tipagem em tempo de desenvolvimento.

### Comando de Restalação Rápida
Se o usuário solicitar a volta ao backup:
`powershell -Command "Copy-Item -Path '_backup_original\*' -Destination '.' -Recurse -Force"`
Seguido de um `sync`.
