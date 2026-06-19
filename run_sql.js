import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock dotenv
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

async function runSql() {
    const sqlFile = process.argv[2];
    if (!sqlFile) {
        console.error('Uso: node run_sql.js <caminho_do_arquivo_sql>');
        process.exit(1);
    }

    const sqlPath = path.resolve(sqlFile);
    if (!fs.existsSync(sqlPath)) {
        console.error(`Erro: Arquivo não encontrado: ${sqlPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`[SQL Runner] Executando: ${sqlFile}...`);

    try {
        // Tenta primeiro criar a função exec_sql se ela não existir
        const setupSql = `
      CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
      RETURNS void AS $$
      BEGIN
        EXECUTE sql_query;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

        // Como não podemos rodar setupSql via rpc('exec_sql') antes dela existir,
        // usamos uma abordagem recursiva ou avisamos o usuário.
        // No entanto, o service_role key permite rodar RPCs.

        const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (rpcError) {
            console.error('[SQL Runner] Erro:', rpcError.message);
            if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
                console.log('\n[!] IMPORTANTE: A função RPC "exec_sql" não existe no seu Supabase.');
                console.log('Por favor, execute o SQL abaixo NO PAINEL DO SUPABASE (SQL Editor) uma única vez:');
                console.log('--------------------------------------------------');
                console.log(setupSql);
                console.log('--------------------------------------------------');
            }
            process.exit(1);
        }

        console.log('[SQL Runner] Sucesso!');
    } catch (err) {
        console.error('[SQL Runner] Falha Crítica:', err.message);
        process.exit(1);
    }
}

runSql();
