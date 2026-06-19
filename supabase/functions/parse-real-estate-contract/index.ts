import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aqui seria a integração real com OpenAI (GPT-4o com Vision) ou similar
    // Para esta implementação, simularemos a extração inteligente baseada no nome do arquivo
    // ou um comportamento padrão avançado.
    
    console.log(`Processando contrato: ${fileName}`);

    // Simulação de delay de processamento de IA
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Mock de dados extraídos (em um cenário real, enviaríamos o base64 para a OpenAI)
    const mockExtractedData = {
      propertyName: fileName.replace(/\.[^/.]+$/, "").split('_').join(' ').toUpperCase(),
      totalValue: 750000.00,
      downPayment: 150000.00,
      installmentsCount: 60,
      installmentValue: 4500.00,
      indexType: "INCC",
      indexMonthlyRate: 0.65,
      balloons: [
        { month: 12, year: new Date().getFullYear() + 1, amount: 25000 },
        { month: 12, year: new Date().getFullYear() + 2, amount: 25000 }
      ],
      deliveryBalance: 350000.00,
      adjustBalanceDuringObras: true
    };

    return new Response(JSON.stringify(mockExtractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
