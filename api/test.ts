export default function handler(req: any, res: any) {
  res.status(200).json({ status: 'OK', message: 'If you see this, the API system is fundamentally working.' });
}
