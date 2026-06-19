const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (line.includes('activeTab') || line.includes('Imóveis') || line.includes('Corretoras')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
