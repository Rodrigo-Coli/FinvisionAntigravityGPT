import fs from 'fs';
function parseStepOutputFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const firstBrace = content.indexOf('{');
  if (firstBrace === -1) throw new Error('No JSON brace found in ' + filePath);
  const jsonContent = content.substring(firstBrace);
  return JSON.parse(jsonContent);
}

const txsJson = parseStepOutputFile('C:/Users/rodrigo.coli/.gemini/antigravity/brain/7ea051c0-4027-44f1-bbef-7c54a6681a8d/.system_generated/steps/6340/output.txt');
const rawText = txsJson.result;

const first = rawText.indexOf('<untrusted-data');
const last = rawText.lastIndexOf('<untrusted-data');
const close = rawText.indexOf('</untrusted-data');

console.log('First <untrusted-data index:', first);
console.log('Last <untrusted-data index:', last);
console.log('Close </untrusted-data index:', close);

if (first !== -1) {
  console.log('First context:', rawText.substring(first, first + 100));
}
if (last !== -1) {
  console.log('Last context:', rawText.substring(last, last + 100));
}
if (close !== -1) {
  console.log('Close context:', rawText.substring(close, close + 100));
}
