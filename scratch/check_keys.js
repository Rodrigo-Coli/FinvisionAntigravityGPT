import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keysPath = path.resolve(__dirname, '../keys.txt');
if (fs.existsSync(keysPath)) {
    console.log("keys.txt exists");
    const content = fs.readFileSync(keysPath, 'utf8'); // default utf8, but let's see if it's UTF-16LE
    console.log("Length of keys.txt in UTF-8:", content.length);
    
    // Let's read it with utf16le
    const contentUtf16 = fs.readFileSync(keysPath, 'utf16le');
    console.log("Length of keys.txt in UTF-16LE:", contentUtf16.length);
    
    // Print first 100 characters of each to see which one makes sense
    console.log("UTF-8 snippet:", content.slice(0, 100));
    console.log("UTF-16LE snippet:", contentUtf16.slice(0, 100));
} else {
    console.log("keys.txt does not exist");
}
