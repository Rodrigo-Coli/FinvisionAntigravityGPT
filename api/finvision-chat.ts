export default async function handler(req: any, res: any) {
  try {
    // We use dynamic import here to catch any fatal errors during module loading
    const module = await import('../src/api-handlers/finvision-chat');
    const actualHandler = module.default;
    
    if (typeof actualHandler !== 'function') {
      return res.status(200).json({ 
        error: 'INVALID_HANDLER', 
        message: 'O handler importado não é uma função.' 
      });
    }
    
    return await actualHandler(req, res);
  } catch (error: any) {
    console.error('[API Boot Error]:', error);
    return res.status(200).json({ 
      error: 'API_BOOT_CRASH', 
      message: error.message,
      stack: error.stack,
      hint: 'Verifique se o arquivo ../src/api-handlers/finvision-chat existe e se as variáveis de ambiente estão corretas.'
    });
  }
}
