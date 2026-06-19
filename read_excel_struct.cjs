const xlsx = require('xlsx');
const fs = require('fs');

try {
  const filePath = 'C:\\Users\\rodrigo.coli\\Documents\\Rodrigo\\Analise de Balanço Mensal.xlsx';
  const workbook = xlsx.readFile(filePath, { cellFormula: true, cellDates: true });
  const sheetNames = workbook.SheetNames;
  
  const result = {};
  
  sheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Extract raw cells to get headers and some sample formulas
    const range = xlsx.utils.decode_range(sheet['!ref']);
    
    const headers = [];
    const sampleRow1 = [];
    const sampleRow2 = [];
    
    for (let C = range.s.c; C <= range.e.c; ++C) {
        // Headers (Row 0, 1)
        const cell0 = sheet[xlsx.utils.encode_cell({c:C, r:0})];
        const cell1 = sheet[xlsx.utils.encode_cell({c:C, r:1})];
        const hName = (cell0 ? cell0.w || cell0.v : '') + ' ' + (cell1 ? cell1.w || cell1.v : '');
        headers.push(hName.trim());
        
        // Sample Row (Row 2, Row 3)
        const cell2 = sheet[xlsx.utils.encode_cell({c:C, r:2})];
        sampleRow1.push(cell2 ? (cell2.f ? `FORMULA: ${cell2.f}` : cell2.w || cell2.v) : null);
        
        const cell3 = sheet[xlsx.utils.encode_cell({c:C, r:3})];
        sampleRow2.push(cell3 ? (cell3.f ? `FORMULA: ${cell3.f}` : cell3.w || cell3.v) : null);
    }
    
    result[sheetName] = {
      columns: headers,
      sample_1: sampleRow1,
      sample_2: sampleRow2
    };
  });
  
  fs.writeFileSync('c:\\Users\\rodrigo.coli\\Documents\\Antigravity\\FinVision-GPT-main\\FinVision-GPT-main\\excel_structure.json', JSON.stringify(result, null, 2));
  console.log('Successfully wrote dump to excel_structure.json');
} catch (error) {
  console.error('Error reading excel file:', error);
}
