/**
 * BankImportService
 *
 * Parses CSV and OFX bank statement files and creates BankTransactions.
 * Auto-matches imported transactions against open invoices/expenses.
 *
 * Supported formats:
 *   CSV  — Standard bank CSV (Date, Description, Debit, Credit, Balance)
 *   OFX  — Open Financial Exchange (used by most banks worldwide)
 */

import { Injectable, Logger } from '@nestjs/common';
import { BankTransaction } from './accounting.types';

export interface ImportedTransaction {
  date: string;
  description: string;
  amount: string;
  type: 'debit' | 'credit';
  reference?: string;
  balance?: string;
}

export interface BankImportResult {
  imported: number;
  skipped: number;
  transactions: ImportedTransaction[];
  errors: string[];
}

@Injectable()
export class BankImportService {
  private readonly logger = new Logger(BankImportService.name);

  // ── CSV Parser ────────────────────────────────────────────────────────────

  parseCSV(csvContent: string, format: 'standard' | 'uae_fab' | 'uae_adcb' | 'in_hdfc' | 'us_chase' = 'standard'): BankImportResult {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(Boolean);
    const transactions: ImportedTransaction[] = [];
    const errors: string[] = [];
    let skipped = 0;

    // Skip header row
    const dataLines = lines.slice(1);

    for (const [idx, line] of dataLines.entries()) {
      try {
        const cols = this.splitCSVLine(line);
        const txn = this.parseCSVRow(cols, format);
        if (txn) {
          transactions.push(txn);
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`Row ${idx + 2}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(`CSV parsed: ${transactions.length} imported, ${skipped} skipped`);
    return { imported: transactions.length, skipped, transactions, errors };
  }

  private parseCSVRow(cols: string[], format: string): ImportedTransaction | null {
    if (cols.length < 3) return null;

    switch (format) {
      case 'uae_fab': {
        // FAB Format: Date | Description | Debit | Credit | Balance
        const [date, description, debit, credit, balance] = cols;
        const debitAmt = parseFloat(debit?.replace(/[^0-9.]/g, '') || '0');
        const creditAmt = parseFloat(credit?.replace(/[^0-9.]/g, '') || '0');
        if (!debitAmt && !creditAmt) return null;
        return {
          date: this.normalizeDate(date),
          description: description?.trim(),
          amount: (debitAmt || creditAmt).toFixed(2),
          type: debitAmt > 0 ? 'debit' : 'credit',
          balance: balance?.replace(/[^0-9.]/g, ''),
        };
      }

      case 'us_chase': {
        // Chase Format: Details | Posting Date | Description | Amount | Type | Balance
        const [, date, description, amount, , balance] = cols;
        const amt = parseFloat(amount?.replace(/[^0-9.\-]/g, '') || '0');
        return {
          date: this.normalizeDate(date),
          description: description?.trim(),
          amount: Math.abs(amt).toFixed(2),
          type: amt < 0 ? 'debit' : 'credit',
          balance: balance?.replace(/[^0-9.]/g, ''),
        };
      }

      case 'in_hdfc': {
        // HDFC Format: Date | Narration | Chq/Ref | Value Date | Withdrawal | Deposit | Closing Balance
        const [date, narration, ref, , withdrawal, deposit, balance] = cols;
        const withAmt = parseFloat(withdrawal?.replace(/[^0-9.]/g, '') || '0');
        const depAmt = parseFloat(deposit?.replace(/[^0-9.]/g, '') || '0');
        if (!withAmt && !depAmt) return null;
        return {
          date: this.normalizeDate(date),
          description: narration?.trim(),
          amount: (withAmt || depAmt).toFixed(2),
          type: withAmt > 0 ? 'debit' : 'credit',
          reference: ref?.trim(),
          balance: balance?.replace(/[^0-9.]/g, ''),
        };
      }

      default: {
        // Standard: Date | Description | Debit | Credit | Balance
        const [date, description, debit, credit, balance] = cols;
        const debitAmt = parseFloat(debit?.replace(/[^0-9.]/g, '') || '0');
        const creditAmt = parseFloat(credit?.replace(/[^0-9.]/g, '') || '0');
        if (!debitAmt && !creditAmt) return null;
        return {
          date: this.normalizeDate(date),
          description: description?.trim(),
          amount: (debitAmt || creditAmt).toFixed(2),
          type: debitAmt > 0 ? 'debit' : 'credit',
          balance: balance?.replace(/[^0-9.]/g, ''),
        };
      }
    }
  }

  // ── OFX Parser ────────────────────────────────────────────────────────────

  parseOFX(ofxContent: string): BankImportResult {
    const transactions: ImportedTransaction[] = [];
    const errors: string[] = [];

    // Extract STMTTRN blocks
    const txnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match: RegExpExecArray | null;

    while ((match = txnRegex.exec(ofxContent)) !== null) {
      try {
        const block = match[1];
        const get = (tag: string) => new RegExp(`<${tag}>([^<]+)`).exec(block)?.[1]?.trim() ?? '';

        const trntype = get('TRNTYPE'); // DEBIT or CREDIT
        const dtposted = get('DTPOSTED');
        const trnamt = get('TRNAMT');
        const name = get('NAME') || get('MEMO');
        const fitid = get('FITID');
        const checknum = get('CHECKNUM');

        const amount = Math.abs(parseFloat(trnamt));
        if (!amount) continue;

        transactions.push({
          date: this.parseOFXDate(dtposted),
          description: name,
          amount: amount.toFixed(2),
          type: trntype === 'DEBIT' || parseFloat(trnamt) < 0 ? 'debit' : 'credit',
          reference: checknum || fitid,
        });
      } catch (err: any) {
        errors.push(`OFX parse error: ${err.message}`);
      }
    }

    this.logger.log(`OFX parsed: ${transactions.length} transactions`);
    return { imported: transactions.length, skipped: 0, transactions, errors };
  }

  // ── Smart Categorization ─────────────────────────────────────────────────

  autoCategory(description: string): string {
    const desc = description.toLowerCase();
    if (/salary|payroll|wages|staff/i.test(desc)) return 'Payroll';
    if (/rent|lease|office/i.test(desc)) return 'Rent & Office';
    if (/google|aws|azure|slack|zoom|subscription|saas/i.test(desc)) return 'Software';
    if (/travel|uber|taxi|airline|hotel|airbnb/i.test(desc)) return 'Travel';
    if (/amazon|noon|shopify|inventory/i.test(desc)) return 'Inventory';
    if (/electricity|water|internet|phone|du |etisalat|stc/i.test(desc)) return 'Utilities';
    if (/marketing|advertising|meta|google ads|facebook/i.test(desc)) return 'Marketing';
    if (/insurance/i.test(desc)) return 'Insurance';
    if (/legal|lawyer|attorney/i.test(desc)) return 'Legal';
    if (/dining|restaurant|meal|food/i.test(desc)) return 'Meals';
    return 'Other';
  }

  // ── Matching Rules ────────────────────────────────────────────────────────

  applyMatchingRule(description: string, rules: Array<{ pattern: string; category: string }>): string | null {
    for (const rule of rules) {
      try {
        if (new RegExp(rule.pattern, 'i').test(description)) return rule.category;
      } catch { /* skip invalid regex */ }
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private normalizeDate(raw: string): string {
    if (!raw) return new Date().toISOString().slice(0, 10);
    // Handle DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
    const clean = raw.trim().replace(/\./g, '/');
    const parts = clean.split('/');

    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (c.length === 4) {
        // DD/MM/YYYY → YYYY-MM-DD
        return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
      // YYYY/MM/DD or MM/DD/YYYY
      if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }

    return new Date(raw).toISOString().slice(0, 10);
  }

  private parseOFXDate(raw: string): string {
    // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
    const clean = raw.slice(0, 8);
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
}
