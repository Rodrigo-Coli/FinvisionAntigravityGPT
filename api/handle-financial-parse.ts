import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { base64, mimeType } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing file data" });
    }

    const prompt = `
Analise este documento financeiro e extraia todas as transações individuais.

REGRAS:
- Ignore saldos totais
- Ignore resumos
- Ignore totais gerais
- Extraia apenas transações individuais

Para cada transação retorne:

date: data da transação (YYYY-MM-DD)
description: descrição limpa
amount: valor numérico positivo
type: credit ou debit
confidence: número de 0 a 1

Retorne APENAS JSON ARRAY.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              description: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              type: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
            },
            required: ["date", "description", "amount", "type"],
          },
        },
      },
    });

    const text = response.text || "[]";

    return res.status(200).json(JSON.parse(text));
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}
