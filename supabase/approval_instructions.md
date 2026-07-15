
# Guia de Aprovação Manual e Gestão de Usuários

Como o Zyvion Master exige aprovação manual para garantir a segurança dos dados financeiros, siga as instruções abaixo para gerenciar novos cadastros.

## 1. Aprovação via Interface do App (Recomendado)
Se você já é um **Administrador**, pode aprovar usuários diretamente no sistema:
1. Faça login na sua conta.
2. No menu superior, clique em **Usuários**.
3. Localize o usuário pendente na lista.
4. Clique no botão **Aprovar**. O status mudará imediatamente para "Aprovado" e o usuário terá acesso ao dashboard.

---

## 2. Aprovação via Painel do Supabase (Fallback)
Caso você precise aprovar o primeiro administrador ou resolver problemas de acesso:
1. Acesse o [Console do Supabase](https://app.supabase.com/).
2. Selecione o seu projeto.
3. No menu lateral esquerdo, clique em **Table Editor**.
4. Selecione a tabela `profiles` (dentro do schema `public`).
5. Localize a linha do usuário pelo e-mail.
6. Altere a coluna `is_approved` para `true`.
7. Altere a coluna `role` para `admin` caso queira promover o usuário a Administrador.
8. Clique em **Save** na célula editada.

---

## 3. Fluxo de Segurança
- Novos usuários caem automaticamente na rota `/pending` após o cadastro.
- A sessão é mantida, mas as rotas de finanças (Contas, Cartões, IA) são bloqueadas por RLS (Row Level Security) no banco de dados e condicional de renderização no Front-end.
- O e-mail do usuário no Auth do Supabase deve estar confirmado (ou a confirmação automática deve estar ativada nas configurações de Auth do projeto).

---

## 4. Troubleshooting
Se um usuário aprovado ainda ver a tela de pendência:
- Peça para ele clicar em **Verificar Status Novamente** na tela de espera ou realizar o logout e login novamente para atualizar o token de sessão.
