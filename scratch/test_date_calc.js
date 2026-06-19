const newYear = 2026;
const newMonth = 7; // July
const lastDay = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
console.log("July 2026 lastDay in UTC:", lastDay);

// Let's test with local time date parsing or tz conversions
const tz = 'America/Sao_Paulo';
const formatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: tz
});
const dStr = '2026-07-30';
const dateObj = new Date(dStr); // parses as local or UTC?
// In JS, new Date('2026-07-30') is parsed as UTC midnight because it's YYYY-MM-DD!
console.log("new Date('2026-07-30') representation:", dateObj.toISOString());
const formatted = formatter.format(dateObj);
console.log("Formatted:", formatted);
