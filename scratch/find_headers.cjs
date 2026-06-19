const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (line.includes('<h2') || line.includes('<h3') || line.includes('flex justify-between items-center') || line.includes('className="font-bold text-slate-900') || line.includes('text-lg font-bold')) {
    if (index >= 4000 && index <= 5300) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
