async function runHealthDiagnostic() {
  const url = "https://finvision-antigravity-gpt.vercel.app/api/health?testWhatsApp=5511999999999";
  
  console.log("Aguardando 10 segundos para a Vercel compilar o deploy...");
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log("Chamando endpoint de diagnostico ativo:", url);

  try {
    const res = await fetch(url);
    console.log("Status da Resposta:", res.status);
    const data = await res.json();
    console.log("Diagnosticos Recebidos:\n", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Erro ao chamar o diagnostico:", err);
  }
}

runHealthDiagnostic();
