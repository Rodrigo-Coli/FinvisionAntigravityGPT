export async function handleHealth(req: any, res: any) {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
