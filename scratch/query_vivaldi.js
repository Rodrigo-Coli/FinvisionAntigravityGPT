import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
    const files = ['.env', '.env.production', '.env.prod.real'];
    for (const f of files) {
        const envPath = path.resolve(__dirname, '../', f);
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    process.env[key] = value;
                }
            });
        }
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
    console.log("=== BUSCANDO VIVALDI ===");
    const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .ilike('description', '%vivaldi%');
    
    if (error) {
        console.error("Erro ao buscar:", error);
    } else {
        console.log(`Encontradas ${txs.length} transações:`);
        txs.forEach(t => {
            console.log(`ID: ${t.id}, Descrição: ${t.description}, Data: ${t.date}, Valor: ${t.amount}, Pago: ${t.is_paid}, Deletado: ${t.is_deleted}, UserID: ${t.user_id}`);
        });
    }
}

check();
