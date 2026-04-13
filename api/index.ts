export default async function handler(req: any, res: any) {
  return res.status(200).json({ 
    status: 'SYSTEM_UP', 
    timestamp: new Date().toISOString(),
    message: 'Se você está vendo isso, a infraestrutura do Vercel está OK. O problema é algum dos módulos importados.' 
  });
}
