const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logPath = 'C:\\Users\\rodrigo.coli\\.gemini\\antigravity\\brain\\7ea051c0-4027-44f1-bbef-7c54a6681a8d\\.system_generated\\logs\\transcript.jsonl';

async function main() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("=== USER INPUTS ABOUT LOANS ===");
  for await (const line of rl) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'USER_INPUT' && data.content.toLowerCase().includes('emprest')) {
        console.log(`\n--- Date: ${data.created_at} ---`);
        console.log(data.content);
      }
    } catch (err) {
      // ignore parse errors
    }
  }
}

main().catch(console.error);
