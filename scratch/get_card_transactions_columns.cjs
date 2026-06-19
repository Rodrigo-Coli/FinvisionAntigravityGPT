const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.resolve(__dirname, '..', '.env');
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
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data: cols, error } = await supabase.rpc('exec_sql', {
    sql_query: "select column_name, data_type from information_schema.columns where table_name = 'card_transactions'"
  });
  if (error) {
    console.error('Error:', error);
    // Let's try select * from card_transactions limit 1
    const { data, error: err2 } = await supabase.from('card_transactions').select('*').limit(1);
    if (err2) {
      console.error('Error 2:', err2);
    } else {
      console.log('Columns:', Object.keys(data[0] || {}));
    }
  } else {
    console.log('Columns:', cols);
  }
}

run();
