import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env from workspace .env
const envPath = './.env';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
            const key = parts[0].trim();
            let value = parts[1].trim();
            value = value.replace(/^["']|["']$/g, '');
            process.env[key] = value;
        }
    });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findCulprit() {
    const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('*');
        
    if (profError) {
        console.error("Profiles error:", profError.message);
        return;
    }
    
    const userProfile = profiles.find(p => p.email === 'rodrigocolicg@gmail.com');
    if (!userProfile) {
        console.error("User rodrigocolicg@gmail.com not found in profiles!");
        console.log("Profiles list:", profiles.map(p => ({id: p.id, email: p.email})));
        return;
    }
    
    console.log("Found profile:", userProfile.id, userProfile.email);
    
    // Fetch transactions in June 2026
    const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userProfile.id)
        .eq('is_deleted', false)
        .gte('date', '2026-06-01')
        .lte('date', '2026-06-20');
        
    if (txError) {
        console.error("Transactions error:", txError.message);
        return;
    }
    
    console.log(`\nFound ${txs.length} bank transactions between 01/06/2026 and 20/06/2026:`);
    const largeTxs = txs.filter(t => t.amount > 5000);
    console.log("Large bank transactions (>5000):", JSON.stringify(largeTxs, null, 2));
    
    // Fetch card transactions in June 2026
    const { data: cardTxs, error: cardError } = await supabase
        .from('card_transactions')
        .select('*')
        .eq('user_id', userProfile.id)
        .gte('date', '2026-06-01')
        .lte('date', '2026-06-20');
        
    if (cardError) {
        console.error("Card transactions error:", cardError.message);
        return;
    }
    
    console.log(`\nFound ${cardTxs.length} card transactions between 01/06/2026 and 20/06/2026:`);
    const largeCardTxs = cardTxs.filter(c => c.amount > 5000);
    console.log("Large card transactions (>5000):", JSON.stringify(largeCardTxs, null, 2));
}

findCulprit();
