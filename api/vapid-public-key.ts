export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    console.error('SERVER_ERROR: VAPID_PUBLIC_KEY missing in Env Vars.');
    return res.status(500).json({ error: 'Chave VAPID_PUBLIC_KEY não configurada no servidor Vercel.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).json({ publicKey });
}
