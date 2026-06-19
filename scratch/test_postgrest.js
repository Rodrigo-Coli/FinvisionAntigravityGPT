const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function run() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    console.log("Logged in user:", user ? user.email : "none");

    const startDate = '2026-05-01';
    const endDate = '2026-05-31';
    const futureLimit = '2026-07-24';

    console.log("Testing txQuery with nested OR/AND...");
    const txsRes = await supabase.from('transactions')
      .select('*, attachments:documents!documents_transaction_id_fkey(*)')
      .eq('is_deleted', false)
      .or(`and(date.gte.${startDate},date.lte.${endDate}),and(metadata->>is_provision.eq.true,date.gte.${startDate},date.lte.${futureLimit})`);

    if (txsRes.error) {
      console.error("txsRes error:", txsRes.error);
    } else {
      console.log("txsRes success! Count:", txsRes.data.length);
    }

    console.log("Testing cardQuery...");
    const cardsRes = await supabase.from('card_transactions')
      .select('id, date, amount, description, categories(name)');

    if (cardsRes.error) {
      console.error("cardsRes error:", cardsRes.error);
    } else {
      console.log("cardsRes success! Count:", cardsRes.data.length);
    }
  } catch (err) {
    console.error("Execution error:", err);
  }
}

run();
