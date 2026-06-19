async function runTest() {
  const url = "https://finvision.automanow.com.br/api/whatsapp-webhook";
  
  // Test case 1: Send mock messages.upsert payload with a random phone number
  const payload = {
    event: "MESSAGES_UPSERT",
    instance: "FinVision",
    data: {
      key: {
        remoteJid: "558296705909@s.whatsapp.net",
        fromMe: false,
        id: "TEST_MESSAGE_ID_UPDATE"
      },
      pushName: "Rodrigo Coli",
      message: {
        conversation: "troque a conta para bradesco, a de destino"
      }
    }
  };

  console.log("Enviando POST para:", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log("Status da Resposta:", res.status);
    const text = await res.text();
    console.log("Corpo da Resposta:", text);
  } catch (err) {
    console.error("Erro na requisicao:", err);
  }
}

runTest();
