import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                process.env[parts[0].trim()] = parts[1].trim();
            }
        });
    }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Erro: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    console.log("=== ÚLTIMOS IMPORTS ===");
    const { data: imports, error: impErr } = await supabase
        .from('imports')
        .select('id, user_id, status, created_at, account_id, type, notes')
        .order('created_at', { ascending: false })
        .limit(10);
    if (impErr) console.error("Erro imports:", impErr);
    else console.log(imports);

    console.log("\n=== STATUS DAS IMPORTED_TRANSACTIONS ===");
    const { data: counts, error: countErr } = await supabase
        .from('imported_transactions')
        .select('status, id', { count: 'exact', head: false });
    if (countErr) {
        console.error("Erro counts:", countErr);
    } else {
        // Agrupar localmente por status
        const statusCounts = {};
        counts.forEach(c => {
            statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
        });
        console.log("Counts por status:", statusCounts);
    }

    console.log("\n=== ÚLTIMAS 10 IMPORTED_TRANSACTIONS ===");
    const { data: impTxs, error: txsErr } = await supabase
        .from('imported_transactions')
        .select('id, user_id, date, description, amount, status, account_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    if (txsErr) console.error("Erro impTxs:", txsErr);
    else console.log(impTxs);

    console.log("\n=== ÚLTIMAS TRANSAÇÕES DEFINITIVAS ===");
    const { data: txs, error: finalErr } = await supabase
        .from('transactions')
        .select('id, user_id, date, description, amount, type, account_id, category, metadata')
        .order('created_at', { ascending: false })
        .limit(10);
    if (finalErr) console.error("Erro txs:", finalErr);
    else console.log(txs);
}

check();
