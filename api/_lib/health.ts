import { isCronAuthorized } from './cron-auth.js';

export async function handleHealth(req: any, res: any) {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const evolutionInstance = process.env.EVOLUTION_INSTANCE;

  const diagnostics: any = {
    supabaseConnected: true,
    evolutionConfigured: !!(evolutionUrl && evolutionKey && evolutionInstance),
    evolutionDetails: null,
    whatsappSendTest: null,
    timestamp: new Date().toISOString()
  };

  // Sem o segredo do cron (?key=... ou Authorization: Bearer ...), o endpoint
  // responde só o "ok" básico — é o que o app usa. Antes, qualquer pessoa
  // conseguia mandar WhatsApp pelo seu número (?testWhatsApp=) e trocar a URL
  // do webhook do Evolution (?setWebhook=true) sem login nenhum.
  const authorized = isCronAuthorized(req);
  if (!authorized) {
    return res.status(200).json({ status: 'ok', timestamp: diagnostics.timestamp });
  }

  if (diagnostics.evolutionConfigured) {
    try {
      const response = await fetch(`${evolutionUrl}/instance/connectionState/${evolutionInstance}`, {
        method: 'GET',
        headers: { 'apikey': evolutionKey as string }
      });
      
      if (response.ok) {
        const data = await response.json();
        diagnostics.evolutionDetails = {
          reached: true,
          status: response.status,
          data: data
        };
      } else {
        const text = await response.text().catch(() => '');
        diagnostics.evolutionDetails = {
          reached: true,
          status: response.status,
          error: text || 'Erro na resposta do servidor Evolution'
        };
      }
    } catch (err: any) {
      diagnostics.evolutionDetails = {
        reached: false,
        error: err.message
      };
    }

    // Obter detalhes do Webhook configurado no Evolution API
    try {
      const cleanUrl = String(evolutionUrl).endsWith('/') ? String(evolutionUrl).slice(0, -1) : evolutionUrl;
      const response = await fetch(`${cleanUrl}/webhook/find/${evolutionInstance}`, {
        method: 'GET',
        headers: { 'apikey': evolutionKey as string }
      });
      if (response.ok) {
        diagnostics.webhookDetails = await response.json().catch(() => null);
      } else {
        diagnostics.webhookDetails = { error: `HTTP ${response.status} finding webhook` };
      }
    } catch (err: any) {
      diagnostics.webhookDetails = { error: err.message };
    }

    // Configurar o webhook se explicitamente solicitado via query param (?setWebhook=true)
    if (req.query.setWebhook) {
      try {
        const cleanUrl = String(evolutionUrl).endsWith('/') ? String(evolutionUrl).slice(0, -1) : evolutionUrl;
        const response = await fetch(`${cleanUrl}/webhook/set/${evolutionInstance}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'apikey': evolutionKey as string
          },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              // O segredo vai na própria URL para o webhook conseguir provar que
              // veio do Evolution (ver isWebhookAuthorized em whatsapp-webhook.ts).
              url: process.env.WHATSAPP_WEBHOOK_SECRET
                ? `https://zyvion.automanow.com.br/api/whatsapp-webhook?secret=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET)}`
                : 'https://zyvion.automanow.com.br/api/whatsapp-webhook',
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT']
            }
          })
        });
        if (response.ok) {
          diagnostics.webhookSetup = await response.json().catch(() => null);
        } else {
          diagnostics.webhookSetup = { error: `HTTP ${response.status} setting webhook` };
        }
      } catch (err: any) {
        diagnostics.webhookSetup = { error: err.message };
      }
    }

    // Opcional: Testar o envio real se o parametro testWhatsApp estiver presente
    if (req.query.testWhatsApp) {
      try {
        const number = String(req.query.testWhatsApp).replace(/\D/g, '');
        const url = `${evolutionUrl}/message/sendText/${evolutionInstance}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'apikey': evolutionKey as string 
          },
          body: JSON.stringify({ 
            number: number, 
            text: "Zyvion Teste de Conexão WhatsApp 🤖"
          })
        });

        const data = await response.json().catch(() => null);
        diagnostics.whatsappSendTest = {
          success: response.ok,
          status: response.status,
          url: url.replace(evolutionKey || '', '***'), // oculta segredo por segurança
          response: data
        };
      } catch (err: any) {
        diagnostics.whatsappSendTest = {
          success: false,
          error: err.message
        };
      }
    }
  }

  return res.status(200).json({ status: 'ok', diagnostics });
}
