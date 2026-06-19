const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/History.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('handleUpdate') || line.includes('relative') || line.includes('parcela') || line.includes('venc') || line.includes('Date')) {
    if (line.includes('handleUpdate') || line.includes('date') || line.includes('Month') || line.includes('Day')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
