const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (line.includes('onClick={() =>') || line.includes('activeTab ===') || line.includes('tab ===') || line.includes('tab===')) {
    if (line.includes('REAL_ESTATE') || line.includes('VEHICLE') || line.includes('INVESTMENT') || line.includes('LOAN')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
