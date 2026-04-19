import { GoogleGenAI } from '@google/genai';

async function test() {
    console.log('Testando GoogleGenAI init...');
    let ai;
    try {
        const key = process.env.GEMINI_API_KEY || process.env.API_KEY || 'N/A';
        console.log('Key available:', key !== 'N/A' ? 'SIM' : 'NAO', 'Length:', key.length);
        
        ai = new GoogleGenAI({ apiKey: 'dummy-key' });
        console.log('SDK initialized!');
    } catch (e) {
        console.error('Erro na IA:', e);
    }
}
test();
