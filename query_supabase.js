
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
        envContent.split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim();
                let value = parts[1].trim();
                // strip surrounding quotes if any
                value = value.replace(/^["']|["']$/g, '');
                process.env[key] = value;
            }
        });
    }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function query() {
    const table = process.argv[2];
    if (!table) {
        console.error('Uso: node query_supabase.js <tabela>');
        process.exit(1);
    }

    const { data, error } = await supabase.from(table).select('*').limit(50);
    if (error) {
        console.error('Erro:', error.message);
        process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
}

query();
