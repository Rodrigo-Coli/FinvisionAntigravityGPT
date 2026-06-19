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

async function test() {
    const startDate = '2026-05-01';
    const endDate = '2026-05-31';
    const futureLimit = '2026-07-30';
    
    console.log("Running transactions query with .or() filters...");
    const { data, error } = await supabase.from('transactions')
      .select('*, attachments:documents!documents_transaction_id_fkey(*)')
      .or(`and(date.gte.${startDate},date.lte.${endDate}),and(metadata->>is_provision.eq.true,date.gte.${startDate},date.lte.${futureLimit})`);
        
    if (error) {
        console.error("Tx Query Error:", error);
    } else {
        console.log("Tx Query success! Data sample length:", data.length);
    }
}

test();
