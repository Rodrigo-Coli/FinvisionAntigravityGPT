const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes("from('physical_assets')") || line.includes('"physical_assets"')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
