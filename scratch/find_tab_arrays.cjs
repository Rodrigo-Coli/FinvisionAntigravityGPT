const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (line.includes('const tabs') || line.includes('let tabs') || line.includes('tabs =') || line.includes('tabs.map')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
