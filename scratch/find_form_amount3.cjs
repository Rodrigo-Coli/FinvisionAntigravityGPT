const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (index >= 5500 && index < 5800) {
    if (line.includes('estimatedValue') || line.includes('acquisitionDate') || line.includes('input') || line.includes('label')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
