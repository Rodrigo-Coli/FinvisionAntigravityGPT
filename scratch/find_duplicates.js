import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
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

async function findDuplicates() {
  console.log("=== DUPLICATE SUBCATEGORIES ===");
  const { data: subcats, error: subErr } = await supabase
    .from('subcategories')
    .select('id, name, category_id, user_id');
  
  if (subErr) {
    console.error("Error fetching subcategories:", subErr.message);
  } else {
    const grouped = {};
    subcats.forEach(s => {
      const key = `${s.user_id}_${s.category_id}_${s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });
    
    Object.keys(grouped).forEach(k => {
      if (grouped[k].length > 1) {
        console.log(`Duplicate found for key ${k}:`, grouped[k]);
      }
    });
  }
}

findDuplicates();
