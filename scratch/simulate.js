import fs from 'fs';
import path from 'path';

function parseStepOutputFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const firstBrace = content.indexOf('{');
  if (firstBrace === -1) throw new Error('No JSON brace found in ' + filePath);
  const jsonContent = content.substring(firstBrace);
  return JSON.parse(jsonContent);
}

// Load data
const assetsJson = parseStepOutputFile('C:/Users/rodrigo.coli/.gemini/antigravity/brain/7ea051c0-4027-44f1-bbef-7c54a6681a8d/.system_generated/steps/6278/output.txt');
const txsJson = parseStepOutputFile('C:/Users/rodrigo.coli/.gemini/antigravity/brain/7ea051c0-4027-44f1-bbef-7c54a6681a8d/.system_generated/steps/6340/output.txt');

function extractJSON(rawText) {
  const start = rawText.indexOf('[');
  const end = rawText.lastIndexOf(']');
  if (start === -1 || end === -1) return null;
  const jsonText = rawText.substring(start, end + 1);
  return JSON.parse(jsonText);
}

const assets = extractJSON(assetsJson.result);
const transactions = extractJSON(txsJson.result).map(t => ({
  id: t.id,
  description: t.description,
  amount: Number(t.amount),
  date: t.date,
  type: t.type,
  category: t.category,
  subcategory: t.subcategory,
  isPaid: t.is_paid,
  metadata: t.metadata || {},
  liability_id: t.liability_id
}));

const activeLiabilities = []; // Empty or not needed for simple check

const getAssetTransactions = (p) => {
  const assetId = p.id;
  const assetName = p.name.toLowerCase();
  const cleanName = assetName
    .replace(/apartamento|casa|carro|veículo|jeep|honda|audi|toyota/g, '')
    .trim();

  return transactions.filter(t => {
    // 1. Explicit link in metadata
    if (t.metadata?.linked_asset_id === assetId) return true;

    // 2. Explicit link via liability_id if liability is linked to this asset
    if (t.liability_id) {
      const isLinkedLiability = activeLiabilities.some(l => l.id === t.liability_id && l.linkedAssetId === assetId);
      if (isLinkedLiability) return true;
    }

    // 3. Substring matching as robust fallback
    if (cleanName.length > 2) {
      const descLower = t.description.toLowerCase();
      if (descLower.includes(cleanName)) {
        if (cleanName === 'piazza' && descLower.includes('piazzaria')) {
          return false;
        }
        return true;
      }
      const firstWord = cleanName.split(/\s+/)[0];
      if (firstWord && firstWord.length > 3 && descLower.includes(firstWord)) {
        if (firstWord === 'piazza' && descLower.includes('piazzaria')) {
          return false;
        }
        return true;
      }
    }
    return false;
  });
};

const asset = assets.find(a => a.id === 'cf91e89b-6a09-4e91-8a3f-d4af4f6ddd80');
console.log('Asset:', asset.name);

const assetTxs = getAssetTransactions(asset);
console.log('Total Matched Transactions:', assetTxs.length);

// Print paid transactions in June 2026
const june2026Txs = assetTxs.filter(t => t.date.startsWith('2026-06'));
console.log('June 2026 Transactions:', june2026Txs);

const now = new Date('2026-06-05T21:35:29-03:00'); // User's local time from screenshot metadata
console.log('Simulated now:', now.toString(), 'ISO:', now.toISOString());

const currentMonthStr = now.toISOString().substring(0, 7);
const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const previousMonthStr = previousMonthDate.toISOString().substring(0, 7);
const currentYearStr = String(now.getFullYear());

console.log('currentMonthStr:', currentMonthStr);
console.log('previousMonthStr:', previousMonthStr);
console.log('currentYearStr:', currentYearStr);

const periodTxs = assetTxs.filter((t) => {
  if (!t.isPaid) return false;
  
  // Truncate comparison
  const monthMatch = t.date.substring(0, 7) === currentMonthStr;
  return monthMatch;
});

console.log('Filtered periodTxs (Current Month):', periodTxs);
