
# Configuração do Storage (Supabase)

Para habilitar o armazenamento de recibos e comprovantes no Zyvion, siga estes passos no painel do Supabase:

## 1. Criar o Bucket
1. No menu lateral, clique em **Storage**.
2. Clique em **New Bucket**.
3. Nomeie como: `finvision-documents`.
4. Mantenha como **Private** (Recomendado) ou Public conforme sua necessidade de teste.

## 2. Configurar Políticas de Acesso (RLS)
Você precisa definir quem pode ler e escrever arquivos. No SQL Editor, você pode executar o conteúdo de `supabase/schema.sql` ou configurar manualmente:

### Via SQL Editor (Recomendado)
Copie e cole o bloco de "POLÍTICAS DE STORAGE" do arquivo `supabase/schema.sql` no SQL Editor do Supabase para aplicar as permissões DEV.

### Via Interface do Supabase
1. Vá em **Storage** > **Policies**.
2. No bucket `finvision-documents`, crie uma nova política.
3. Escolha **Full customization**.
4. Para **INSERT**: Nome `Allow Upload`, Roles `anon, authenticated`, Check expression `bucket_id = 'finvision-documents'`.
5. Para **SELECT**: Nome `Allow Read`, Roles `anon, authenticated`, Using expression `bucket_id = 'finvision-documents'`.

## 3. Variáveis de Ambiente (Vite)
Certifique-se de que seu arquivo `.env` tenha:
- `VITE_SUPABASE_URL`: Encontrado em Project Settings > API.
- `VITE_SUPABASE_ANON_KEY`: Encontrado em Project Settings > API.

*Nota: No Vercel, as variáveis podem ser cadastradas com o prefixo VITE_ ou NEXT_PUBLIC_ (o cliente está preparado para ambos).*
