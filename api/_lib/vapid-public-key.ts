export async function handleVapidPublicKey(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (vapidPublicKey.startsWith("'") && vapidPublicKey.endsWith("'")) vapidPublicKey = vapidPublicKey.slice(1, -1);
  if (vapidPublicKey.startsWith('"') && vapidPublicKey.endsWith('"')) vapidPublicKey = vapidPublicKey.slice(1, -1);

  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  }
  return res.status(200).json({ publicKey: vapidPublicKey });
}
