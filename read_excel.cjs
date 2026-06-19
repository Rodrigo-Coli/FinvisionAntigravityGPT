const xlsx = require('xlsx');
const fs = require('fs');

try {
  const filePath = 'C:\\Users\\rodrigo.coli\\Documents\\Rodrigo\\Analise de Balanço Mensal.xlsx';
  console.log('Reading file:', filePath);
  
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  
  console.log('Sheets found:', sheetNames);
  
  const result = {};
  
  sheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    // Convert to JSON, getting the first 50 rows to understand the structure
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    result[sheetName] = data.slice(0, 50); // Get first 50 rows for context
  });
  
  fs.writeFileSync('c:\\Users\\rodrigo.coli\\Documents\\Antigravity\\FinVision-GPT-main\\FinVision-GPT-main\\excel_dump.json', JSON.stringify(result, null, 2));
  console.log('Successfully wrote dump to excel_dump.json');
} catch (error) {
  console.error('Error reading excel file:', error);
}
