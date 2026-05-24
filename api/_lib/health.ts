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
            text: "FinVision Teste de Conexão WhatsApp 🤖"
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
