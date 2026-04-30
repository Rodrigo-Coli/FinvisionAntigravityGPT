export async function handleVapidPublicKey(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  }
  return res.status(200).json({ publicKey: vapidPublicKey });
}
