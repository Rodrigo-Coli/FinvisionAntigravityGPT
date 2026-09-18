# Passo a passo para publicar as correções de segurança (18/09/2026)

Faça na ordem. Cada passo leva poucos minutos. Nada aqui apaga dados de cliente.

## Passo 1 — Revogar os tokens que estavam no repositório (5 min)

1. Abra https://github.com/settings/tokens
2. Se existir algum token na lista, clique em **Delete** em todos (o app não usa nenhum deles; eram de scripts antigos).
3. Não precisa criar outro.

## Passo 2 — Criar o segredo do WhatsApp na Vercel (5 min)

1. Abra https://vercel.com → projeto **finvision-antigravity-gpt** → **Settings** → **Environment Variables**.
2. Clique em **Add New**:
   - Key: `WHATSAPP_WEBHOOK_SECRET`
   - Value: uma senha longa, só letras e números, sem espaços. Exemplo de formato: `zyv8k2m9q4w1e7r5t3y6u0p2a8s4d6f1`
     (gere uma nova, não use essa).
   - Marque **Production**, **Preview** e **Development**.
3. Salve. Guarde esse valor: ele será usado no Passo 3.
4. Confira, na mesma tela, se existem `CRON_SECRET`, `ASAAS_WEBHOOK_TOKEN` e `GEMINI_API_KEY`. Se algum faltar, me avise.

## Passo 3 — Atualizar a URL do webhook no Evolution (5 min)

No painel do Evolution API (Manager), na instância do Zyvion, em **Webhook**:

- URL atual: `https://zyvion.automanow.com.br/api/whatsapp-webhook`
- Nova URL: `https://zyvion.automanow.com.br/api/whatsapp-webhook?secret=COLE_AQUI_O_VALOR_DO_PASSO_2`

Salve. Pode fazer isto antes de publicar o código: a versão antiga ignora o `?secret=`.

Se não conseguir achar a tela no Evolution, me avise: existe um atalho pela própria API do app para gravar o webhook (`/api/health?setWebhook=true&key=SEU_CRON_SECRET`), que só funciona depois de publicar o código.

## Passo 4 — Rodar o SQL no Supabase (5 min)

1. Abra https://supabase.com/dashboard → projeto **Finvision Antigravity** → **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/2026-09-18_security_hardening.sql` deste repositório, copie TODO o conteúdo e cole no editor.
3. Clique em **Run**. Deve terminar sem erro ("Success. No rows returned").
4. Se aparecer erro, copie a mensagem e me mande. Pode rodar de novo sem problema.

Isso fecha a escalada para administrador, protege as views e as tabelas de backup, e trava as funções perigosas. Não mexe em nenhum lançamento.

## Passo 5 — Publicar o código (5 min)

1. Abra o GitHub → repositório **FinvisionAntigravityGPT** → **Pull requests** → **New pull request**.
2. Base: `main`. Compare: `claude/app-security-functionality-audit-0oa9fk`.
3. **Create pull request** → **Merge pull request** → **Confirm merge**.
4. A Vercel publica sozinha em 2 a 3 minutos.

## Passo 6 — Conferir (5 min)

1. Abra o app, entre na sua conta e teste: **Chat IA** (mande "qual meu saldo?"), **Diagnóstico patrimonial**, **escanear um cupom** e **categorizar com IA** no Histórico.
   - Se alguma dessas telas disser "Login necessário", saia e entre de novo (o token novo passa a ser enviado).
2. Mande "oi" para o WhatsApp do Zyvion. Deve responder normalmente.
   - Se não responder: Vercel → projeto → **Logs**. Procure `[WhatsApp Webhook] Recusado`. Se aparecer, o `?secret=` da URL do Evolution está diferente do valor da Vercel.
3. No seu computador, se você roda o app localmente: antes de dar `git pull`, copie o arquivo `.env` para um lugar seguro. O `.env` deixou de ser versionado e o `git pull` pode apagar a cópia local. Depois do pull, coloque o `.env` de volta na pasta do projeto.

## Passo 7 — Trocar as chaves de notificação push (opcional, 10 min)

A chave privada VAPID estava no repositório. Trocar invalida as inscrições de push atuais (o app se reinscreve sozinho na próxima abertura).

1. No terminal, dentro da pasta do projeto: `npx web-push generate-vapid-keys`
2. Na Vercel, atualize `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` com os valores gerados.
3. **Deployments** → **Redeploy** no último deploy.

## O que mudou no código (resumo)

- Toda chamada de IA (chat, diagnóstico, cupom, categorização, conciliação) agora exige o login do usuário; o app manda o token automaticamente.
- Webhook do WhatsApp só aceita chamadas com o segredo.
- `/api/health` só executa ações com o segredo do cron.
- Cron diário protegido por inteiro.
- Promoção de conta demo restrita a contas demo.
- Saque de afiliado: reserva atômica (sem pagamento em dobro) e trava antes da transferência Pix.
- Checkout: valida período, forma de pagamento, validade e limite de uso do cupom.
- Chat IA: HTML da resposta neutralizado (sem XSS).
- Fatura provisionada vai para a conta vinculada ao cartão.
- Limite de IA passa a contar conciliações.
- Removidas 4 rotas antigas de importação sem autenticação e a pasta `scratch/`.
- `.env*` deixam de ser versionados.
