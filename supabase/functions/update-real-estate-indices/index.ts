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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Simular a busca dos índices atuais (INCC e IPCA)
    // Em um cenário real, poderíamos usar um scraper ou API do IBGE/FGV
    const currentIndices = {
      INCC: 0.0072, // 0.72% no mês
      IPCA: 0.0045, // 0.45% no mês
    };

    console.log("Iniciando atualização mensal de índices imobiliários...");

    // 2. Buscar todas as dívidas imobiliárias ativas
    const { data: liabilities, error: liabError } = await supabase
      .from("liabilities")
      .select("*")
      .not("metadata", "is", null);

    if (liabError) throw liabError;

    const results = [];

    for (const liab of liabilities) {
      const indexType = liab.metadata?.index_type;
      const needsAdjustment = liab.metadata?.adjust_balance_during_obras;
      
      if (!indexType || !currentIndices[indexType]) continue;

      const rate = currentIndices[indexType];

      // 3. Atualizar o saldo devedor se marcado para reajuste cumulativo
      if (needsAdjustment) {
        const newBalance = liab.remaining_balance * (1 + rate);
        await supabase
          .from("liabilities")
          .update({ remaining_balance: newBalance })
          .eq("id", liab.id);
        
        results.push({ id: liab.id, type: "LIABILITY_BALANCE", old: liab.remaining_balance, new: newBalance });
      }

      // 4. Atualizar transações futuras (parcelas) vinculadas a esta dívida
      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("liability_id", liab.id)
        .eq("is_paid", false);

      if (txError) continue;

      for (const tx of transactions) {
        const newAmount = tx.amount * (1 + rate);
        await supabase
          .from("transactions")
          .update({ 
            amount: newAmount,
            metadata: { ...tx.metadata, last_index_update: new Date().toISOString(), applied_rate: rate }
          })
          .eq("id", tx.id);
          
        results.push({ id: tx.id, type: "TRANSACTION_AMOUNT", old: tx.amount, new: newAmount });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `${results.length} registros atualizados com os índices do mês.`,
      indices_applied: currentIndices 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
