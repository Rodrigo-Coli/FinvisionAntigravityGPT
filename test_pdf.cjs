const fs = require('fs');
const PDFParser = require('pdf2json');
const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    const rawText = pdfParser.getRawTextContent();
    fs.writeFileSync('./pdf_output.txt', rawText);
    console.log("Extracted text. Length:", rawText.length);
});

pdfParser.loadPDF("./_importar/mobillsfev24afev26-15.pdf");
