const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (index >= 5030 && index <= 5130) {
    if (line.includes('button') || line.includes('onClick') || line.includes('Novo')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
