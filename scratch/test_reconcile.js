import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not found in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define active user ID and Bradesco card ID
const userId = '9487923b-a8ec-4655-b837-5ec6748dcfba';
const cardId = 'e79a0c1a-aa94-47fb-b285-fdbd7bb1ac1f';
const txId = '6197db8f-93d1-488a-83eb-a3555930454c'; // IFD*MADERO INDUSTRIA E CO

async function runTest() {
  try {
    console.log("=== INICIANDO TESTE DE CONCILIAÇÃO ===");
    
    // 1. Fetch the card details
    console.log("1. Buscando cartão...");
    const { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (cardErr) throw cardErr;
    console.log("Cartão encontrado:", card.name, "Final:", card.last4, "Fechamento:", card.closing_day);

    // 2. Fetch the imported transaction
    console.log("2. Buscando transação importada...");
    const { data: tx, error: txErr } = await supabase
      .from('imported_transactions')
      .select('*')
      .eq('id', txId)
      .single();
    if (txErr) throw txErr;
    console.log("Transação encontrada:", tx.description, "Valor:", tx.amount, "Data:", tx.date);

    // 3. Resolve or create statement ID (simulate FinanceService.getOrCreateStatement)
    console.log("3. Resolvendo ou criando fatura...");
    const dateStr = tx.date;
    const txDate = new Date(dateStr);
    const day = txDate.getUTCDate();
    const month = txDate.getUTCMonth(); // 0-indexed
    const year = txDate.getUTCFullYear();

    let targetMonth = month;
    let targetYear = year;

    if (day > card.closing_day) {
      targetMonth++;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }

    const stmtMonth = targetMonth + 1; // 1-indexed para o banco
    const stmtYear = targetYear;
    console.log(`Período da Fatura Calculado: ${stmtMonth}/${stmtYear} (dia da transação: ${day}, fechamento: ${card.closing_day})`);

    const { data: existing, error: existErr } = await supabase
      .from('card_statements')
      .select('id')
      .eq('card_id', cardId)
      .eq('month', stmtMonth)
      .eq('year', stmtYear)
      .maybeSingle();
    
    if (existErr) throw existErr;

    let stmtId = '';
    if (existing) {
      stmtId = existing.id;
      console.log("Fatura existente encontrada:", stmtId);
    } else {
      console.log("Fatura não existe. Criando nova fatura...");
      const closingDate = new Date(Date.UTC(targetYear, targetMonth, card.closing_day));

      let dueMonth = targetMonth;
      let dueYear = targetYear;
      if (card.due_day < card.closing_day) {
        dueMonth++;
        if (dueMonth > 11) {
          dueMonth = 0;
          dueYear++;
        }
      }
      const dueDate = new Date(Date.UTC(dueYear, dueMonth, card.due_day));

      const { data: newStmt, error: createErr } = await supabase
        .from('card_statements')
        .insert({
          user_id: userId,
          card_id: cardId,
          month: stmtMonth,
          year: stmtYear,
          status: 'OPEN',
          total_amount: 0,
          paid_amount: 0,
          closing_date: closingDate.toISOString(),
          due_date: dueDate.toISOString()
        })
        .select()
        .single();

      if (createErr) throw createErr;
      stmtId = newStmt.id;
      console.log("Fatura criada com sucesso:", stmtId);
    }

    // 4. Try inserting the transaction into card_transactions
    console.log("4. Inserindo na tabela card_transactions...");
    const parsedCardAmt = Number(tx.amount);
    
    const { data: cardTx, error: insertErr } = await supabase
      .from('card_transactions')
      .insert({
        user_id: userId,
        card_id: cardId,
        used_card_id: cardId,
        statement_id: stmtId,
        date: dateStr,
        description: tx.description,
        amount: Math.abs(parsedCardAmt),
        source: 'IMPORT',
        status: 'POSTED',
        owner_name: 'Pessoal'
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    console.log("Transação inserida em card_transactions com ID:", cardTx.id);

    // 5. Update transaction status in queue
    console.log("5. Atualizando fila de conciliação para OK...");
    const { error: updateQueueErr } = await supabase
      .from('imported_transactions')
      .update({ status: 'OK' })
      .eq('id', txId);

    if (updateQueueErr) throw updateQueueErr;
    console.log("Fila atualizada com sucesso!");

    // Clean up to revert changes
    console.log("=== LIMPEZA: Revertendo alterações do teste ===");
    await supabase.from('card_transactions').delete().eq('id', cardTx.id);
    await supabase.from('imported_transactions').update({ status: 'READY_TO_RECONCILE' }).eq('id', txId);
    console.log("Reversão concluída com sucesso. Banco de dados limpo!");

  } catch (error) {
    console.error("!!! ERRO NO TESTE DE CONCILIAÇÃO !!!");
    console.error(error);
  }
}

runTest();
