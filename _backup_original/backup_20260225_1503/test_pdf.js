import fs from 'fs';
import pdf from 'pdf-parse';

async function extract() {
    let dataBuffer = fs.readFileSync('./_importar/mobillsfev24afev26-15.pdf');
    try {
        const data = await pdf(dataBuffer);
        fs.writeFileSync('pdf_output.txt', data.text);
        console.log("Extracted text. Length:", data.text.length);
    } catch (e) {
        console.error(e);
    }
}
extract();
