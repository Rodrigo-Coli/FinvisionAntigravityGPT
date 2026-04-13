import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, slug, price_cents, ai_scans_limit, trial_days, features, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
