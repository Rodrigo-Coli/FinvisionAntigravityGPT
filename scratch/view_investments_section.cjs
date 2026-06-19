const fs = require('fs');
const content = fs.readFileSync('c:/Users/rodrigo.coli/Documents/Antigravity/FinVision-GPT-main/FinVision-GPT-main/pages/Assets.tsx', 'utf8');
const lines = content.split('\n');

let inInvestments = false;
let bracketCount = 0;

lines.forEach((line, index) => {
  if (line.includes("activeView === 'investments'")) {
    console.log(`--- Start of activeView === 'investments' at line ${index + 1} ---`);
    inInvestments = true;
  }
  if (inInvestments) {
    console.log(`${index + 1}: ${line}`);
    if (line.includes('{')) bracketCount += (line.match(/{/g) || []).length;
    if (line.includes('}')) bracketCount -= (line.match(/}/g) || []).length;
    if (bracketCount < 0) {
      console.log(`--- End of activeView === 'investments' at line ${index + 1} ---`);
      inInvestments = false;
    }
    // Limit to 200 lines to avoid too much output
    if (index > 5200) {
      // We can also filter or break
    }
  }
});
