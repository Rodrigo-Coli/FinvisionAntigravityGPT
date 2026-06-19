const fs = require('fs');
const lines = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
  if (line.includes('REAL_ESTATE') || line.includes('VEHICLE') || line.includes('CONSORTIUM') || line.includes('INVESTMENT')) {
    if (line.includes('===') || line.includes('filter') || line.includes('button') || line.includes('Tab') || line.includes('state')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
