---
description: Protocolo de Retrocompatibilidade e Evolução Segura (Passado Preservado)
---

# Protocolo de Evolução Segura: Zyvion

Este documento estabelece as regras obrigatórias para qualquer alteração no esquema do banco de dados (Supabase) ou na lógica de negócio do sistema. O objetivo é garantir que **nenhuma atualização invalide o histórico do usuário**.

## 1. Regras para Banco de Dados (SQL)

- **Novas Colunas**: Devem SEMPRE permitir nulos (`NULL`) ou ter um valor `DEFAULT` definido.
- **Constraints (CHECK)**: Novas validações não devem impedir a edição de registros que não as cumpriam anteriormente.
- **Triggers**: Devem utilizar `COALESCE` ou verificações de nulo para evitar erros de execução em registros incompletos.
- **Migrações**: Nunca delete colunas sem antes garantir que o dado foi migrado para um novo destino de forma segura.

## 2. Regras para Aplicação (Frontend/Serviços)

- **Tipagem (TypeScript)**: Novos campos em interfaces existentes (como `Transaction` ou `Account`) devem ser marcados como opcionais (`field?: type`).
- **Fallbacks Inteligentes**: Ao ler campos novos, utilize sempre padrões de segurança:
  ```typescript
  const category = tx.new_category_field ?? 'UNSPECIFIED';
  ```
- **Interface de Edição**: Um registro "incompleto" (falta de novos campos obrigatórios) deve exibir um alerta de "Pendente de Revisão", mas **NUNCA** bloquear os botões de:
  - Salvar Alterações
  - Pagar/Liquidar
  - Excluir
  - Ajustar Valor

## 3. Fluxo de Mudança "Breaking"

Se uma mudança for absolutamente necessária e quebrar padrões antigos:
1. Crie uma migração SQL que preencha os valores padrões para todo o histórico.
2. Implemente uma "UI de Reparo" que ajude o usuário a corrigir os dados em massa, sem travar o uso individual.

---
**Lembre-se: O passado do usuário é sagrado. O futuro evolui, o passado permanece funcional.**
