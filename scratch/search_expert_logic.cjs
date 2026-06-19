const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8');
const lines = content.split('\n');

const keywords = [
  'tax', 'LCI', 'LCA', 'CRI', 'CRA', 'Debêntures', 'imposto', 'regressivo',
  'SAC', 'Price', 'Price/SAC', 'liquidez', 'D+0', 'D+1', 'amortização',
  'chart', 'pizza', 'alocação', 'gráfico'
];

lines.forEach((line, index) => {
  keywords.forEach(kw => {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
});
