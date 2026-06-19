const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    const env = {};
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim();
                let value = parts[1].trim();
                value = value.replace(/^["']|["']$/g, '');
                env[key] = value;
            }
        });
    }
    return env;
}

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function find() {
    const userId = '9487923b-a8ec-4655-b837-5ec6748dcfba';
    console.log("Searching in public.transactions...");
    const { data: txs, error: err1 } = await supabase.from('transactions')
        .select('*')
        .eq('user_id', userId);
        
    if (err1) {
        console.error("Txs Error:", err1);
    } else {
        const matches = txs.filter(t => (t.description || '').toLowerCase().includes('solina'));
        console.log(`Txs found: ${txs.length} total, matches:`, matches);
    }
    
    console.log("Searching in public.card_transactions...");
    const { data: cards, error: err2 } = await supabase.from('card_transactions')
        .select('*, cards(*)')
        .eq('user_id', userId);
        
    if (err2) {
        console.error("Cards Error:", err2);
    } else {
        const matches = cards.filter(t => (t.description || '').toLowerCase().includes('solina'));
        console.log(`Cards found: ${cards.length} total, matches:`, matches);
    }
}

find();
