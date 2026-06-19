---
description: Como configurar ambiente de testes e produção via GitHub API e Vercel
---

Este workflow descreve o padrão profissional de desenvolvimento para projetos onde não há Git/Node local. Ele utiliza a API do GitHub para simular o controle de versão e a Vercel para deploys isolados.

## 1. Estrutura do GitHub
O repositório deve ter obrigatoriamente duas branches:
- **main**: Código de produção (Site Oficial).
- **dev**: Código de testes (Ambiente de Preview).

## 2. Scripts de Sincronização (PowerShell)
Devem existir dois scripts na raiz do projeto:

### sync.ps1 (Produção)
Sincroniza os arquivos locais com a branch `main`. 
**Ação:** Só deve ser executado após a aprovação do usuário no ambiente de testes.

### sync_dev.ps1 (Laboratório de Testes)
Sincroniza os arquivos locais com a branch `dev`.
**Ação:** Deve ser executado toda vez que uma nova funcionalidade for implementada.

## 3. Implementação do Script Robusto
O script de sincronização deve usar o seguinte padrão (Substituir $repo e $token):

```powershell
$repo = "Usuario/Projeto"
$token = "SEU_TOKEN"
$branch = "dev" # ou "main"

# Lista de arquivos críticos a sincronizar
$files = @("index.html", "App.tsx", "pages/Settings.tsx", ... )

foreach ($relPath in $files) {
    # 1. Buscar SHA atual do arquivo na branch para evitar conflito 409
    # 2. Ler arquivo local e converter para Base64
    # 3. Enviar via PUT para a API do GitHub (https://api.github.com/repos/$repo/contents/$relPath)
}
```

## 4. Fluxo de Trabalho (Ações do Antigravity)
1. **Desenvolver**: Realizar as alterações nos arquivos locais conforme pedido do usuário.
2. **Testar**: Rodar `sync_dev.ps1` e avisar o usuário para conferir o link de "Preview" no painel da Vercel.
3. **Validar**: Aguardar o "OK" do usuário no link de testes.
4. **Publicar**: Rodar `sync.ps1` para enviar as melhorias aprovadas para o site oficial (main).

## 5. Cuidados Especiais
- **index.html**: No ambiente Vercel/Vite, não use Babel Standalone no HTML final, pois gera tela branca. O código TSX deve ser compilado pela Vercel no servidor.
- **Vercel Layout**: Garanta que as variáveis de ambiente (Supabase) estejam configuradas tanto em "Production" quanto em "Preview" no painel da Vercel.
