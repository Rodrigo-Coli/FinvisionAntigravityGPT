export default function handler(req, res) {
  res.status(200).json({ 
    status: 'OK', 
    engine: 'Node 18 JS',
    message: 'Se você vê isso, o problema é o compilador de TypeScript do Vercel.' 
  });
}
