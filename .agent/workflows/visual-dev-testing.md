---
description: Protocolo de Bypass Autenticação (Dev Mode) e Teste Visual Externo
---

Este workflow descreve como habilitar a visualização imediata do sistema pelo agente, contornando bloqueios de login e falhas de ambiente do navegador (erro de $HOME).

### 1. Implementação do Modo Dev (Bypass)
Sempre que o projeto possuir autenticação que bloqueie a visualização direta, o `App.tsx` (ou componente principal) deve conter este bloco no início do `useEffect` de carregamento:

```typescript
// No topo do useEffect de autenticação/perfil
if (window.location.href.includes('dev=true')) {
  setProfile({ 
    id: 'dev-user', 
    email: 'dev@finvision.pro', 
    role: UserRole.ADMIN, // Garantir acesso administrativo
    is_approved: true,
    created_at: new Date().toISOString()
  });
  setSession({ user: { id: 'dev-user', email: 'dev@finvision.pro' } });
  setLoading(false);
  return;
}
```

### 2. Validação Visual via Terminal (Playwright Externo)
Caso as ferramentas nativas de browser falhem, o assistente deve utilizar o motor Playwright instalado localmente via linha de comando para gerar evidências visuais:

**Comando de Screenshot:**
```powershell
// turbo
$env:PATH = "C:\Users\rodrigo.coli\node-v20.11.1-win-x64;" + $env:PATH; $env:HOME="C:\Users\rodrigo.coli"; C:\Users\rodrigo.coli\node-v20.11.1-win-x64\npx.cmd playwright screenshot --wait-for-timeout 10000 "http://localhost:5050/#/CAMINHO?dev=true" evidência.png
```

### 3. Como invocar este Workflow
- **Comando Direto**: `/visual-dev-testing`
- **Instrução Natural**: "Use o protocolo de bypass de dev para testar a tela" ou "Ative o Modo Dev para enxergar o sistema".

### Vantagens Estratégicas
- **Ignora Sessões Expiradas**: Não depende do Supabase Auth estar logado no contexto do agente.
- **Persistência Visual**: Gera arquivos `.png` que o assistente pode ler e descrever para o usuário, garantindo que o CSS e o layout estão corretos.
- **Automação Pura**: Permite testar rotas profundas da aplicação em segundos.
