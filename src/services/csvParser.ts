import { Transaction, Category, CurrencyCode } from '../types';

function sanitizeCSVCell(str: string): string {
  if (!str) return '""';
  let text = str.trim();
  // Neutralize spreadsheet formula injection characters (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportTransactionsToCSV(transactions: Transaction[], categories: Category[]): string {
  const catMap = new Map<string, string>();
  categories.forEach(c => catMap.set(c.id, c.name));

  const headers = ['Date', 'Time', 'Amount', 'Currency', 'Category', 'Note', 'PaymentMethod', 'IsAutoParsed'];

  const rows = transactions.map(t => {
    const catName = t.customCategoryName || catMap.get(t.categoryId) || 'Others';
    return [
      t.date,
      t.time || '12:00',
      t.amount.toFixed(2),
      t.currency,
      sanitizeCSVCell(catName),
      sanitizeCSVCell(t.note || ''),
      sanitizeCSVCell(t.paymentMethod || ''),
      t.isAutoParsed ? 'Yes' : 'No'
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function importTransactionsFromCSV(
  csvText: string,
  categories: Category[],
  defaultCurrency: CurrencyCode = 'INR'
): { success: boolean; count: number; transactions: Transaction[]; errors: string[] } {
  const errors: string[] = [];
  const parsedTxs: Transaction[] = [];

  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return { success: false, count: 0, transactions: [], errors: ['CSV file is empty or missing data rows.'] };
  }

  // Parse Header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase());

  const dateIdx = headers.findIndex(h => h.includes('date'));
  const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('cost') || h.includes('price') || h.includes('value'));
  const currIdx = headers.findIndex(h => h.includes('curr'));
  const catIdx = headers.findIndex(h => h.includes('cat') || h.includes('tag'));
  const noteIdx = headers.findIndex(h => h.includes('note') || h.includes('desc') || h.includes('payee') || h.includes('merchant'));
  const payIdx = headers.findIndex(h => h.includes('pay') || h.includes('method') || h.includes('type'));
  const timeIdx = headers.findIndex(h => h.includes('time'));

  if (amountIdx === -1) {
    return { success: false, count: 0, transactions: [], errors: ['Could not find an "Amount" column in the CSV file.'] };
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const columns = parseCSVLine(lines[i]);
      if (columns.length === 0) continue;

      const rawAmount = columns[amountIdx] ? columns[amountIdx].replace(/[^0-9.-]/g, '') : '';
      const amount = parseFloat(rawAmount);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${i + 1}: Invalid amount "${columns[amountIdx]}"`);
        continue;
      }

      // Date parsing
      let date = new Date().toISOString().split('T')[0];
      if (dateIdx !== -1 && columns[dateIdx]) {
        const rawDate = columns[dateIdx].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          date = rawDate;
        } else {
          const parsedD = new Date(rawDate);
          if (!isNaN(parsedD.getTime())) {
            date = parsedD.toISOString().split('T')[0];
          }
        }
      }

      // Currency
      let currency: CurrencyCode = defaultCurrency;
      if (currIdx !== -1 && columns[currIdx]) {
        const cStr = columns[currIdx].trim().toUpperCase();
        if (['USD','EUR','GBP','INR','JPY','CAD','AUD','CHF','CNY','SGD'].includes(cStr)) {
          currency = cStr as CurrencyCode;
        }
      }

      // Category matching
      let categoryId = 'cat-others';
      let customCategoryName: string | undefined = undefined;
      if (catIdx !== -1 && columns[catIdx]) {
        const rawCat = columns[catIdx].trim();
        const matchedCat = categories.find(c => c.name.toLowerCase() === rawCat.toLowerCase());
        if (matchedCat) {
          categoryId = matchedCat.id;
        } else {
          categoryId = 'cat-others';
          customCategoryName = rawCat;
        }
      }

      const note = noteIdx !== -1 && columns[noteIdx] ? columns[noteIdx].trim() : 'CSV Imported Expense';
      const paymentMethod = payIdx !== -1 && columns[payIdx] ? columns[payIdx].trim() : 'CSV Import';
      const time = timeIdx !== -1 && columns[timeIdx] ? columns[timeIdx].trim() : '12:00';

      parsedTxs.push({
        id: crypto.randomUUID(),
        amount,
        currency,
        categoryId,
        customCategoryName,
        date,
        time,
        note,
        paymentMethod,
        createdAt: Date.now() - i
      });
    } catch {
      errors.push(`Row ${i + 1}: Malformed line format.`);
    }
  }

  return {
    success: parsedTxs.length > 0,
    count: parsedTxs.length,
    transactions: parsedTxs,
    errors
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
