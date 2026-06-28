import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';

export interface OcrResult {
  amount: string | null;
  date: string | null;
  paymentMethod: string | null;
  referenceNo: string | null;
  description: string | null;
  category: string | null;
  rawText: string;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  async extractFromFile(filePath: string, mimeType: string): Promise<OcrResult> {
    let rawText = '';

    try {
      if (mimeType === 'application/pdf') {
        // For PDFs, return empty — PDF text extraction requires additional libs
        // Tesseract works on images; we skip PDFs gracefully
        return { amount: null, date: null, paymentMethod: null, referenceNo: null, description: null, category: null, rawText: '' };
      }

      const worker = await createWorker('eng', 1, { langPath: process.cwd() });
      const { data } = await worker.recognize(filePath);
      rawText = data.text || '';
      await worker.terminate();
    } catch (err) {
      this.logger.warn(`OCR failed for ${filePath}: ${err.message}`);
      return { amount: null, date: null, paymentMethod: null, referenceNo: null, description: null, category: null, rawText: '' };
    }

    return this.parse(rawText);
  }

  private parse(text: string): OcrResult {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const full = text;

    return {
      amount: this.extractAmount(full),
      date: this.extractDate(full),
      paymentMethod: this.extractPaymentMethod(full),
      referenceNo: this.extractReferenceNo(full),
      description: this.extractDescription(lines),
      category: this.extractCategory(full),
      rawText: full,
    };
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  private extractAmount(text: string): string | null {
    // Patterns: Total: ₹1,234.56  |  TOTAL 1234.00  |  Amount Due: $999  |  Rs. 500
    const patterns = [
      /(?:grand\s*total|total\s*amount|amount\s*due|amount\s*paid|net\s*amount|total)[^\d\n]{0,15}([\d,]+(?:\.\d{1,2})?)/i,
      /(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\b([\d,]+\.\d{2})\b/,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        const val = m[1].replace(/,/g, '');
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0 && num < 10_000_000) return String(num);
      }
    }
    return null;
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  private extractDate(text: string): string | null {
    // Look near label first
    const labeled = text.match(/(?:date|dated|invoice\s*date|bill\s*date)[^\n]{0,5}[:\s]*([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/i);
    if (labeled) return this.normalizeDate(labeled[1]);

    // Any date pattern
    const patterns = [
      /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/,
      /\b(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/,
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{4})\b/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return this.normalizeDate(m[0]);
    }
    return null;
  }

  private normalizeDate(raw: string): string | null {
    // Try various formats → return YYYY-MM-DD
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };

    // "15 Jan 2024" or "Jan 15 2024"
    const wordy = raw.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{4})/i);
    if (wordy) return `${wordy[3]}-${months[wordy[2].toLowerCase().slice(0, 3)]}-${wordy[1].padStart(2, '0')}`;

    const parts = raw.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`; // YYYY-MM-DD
      if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`; // DD-MM-YYYY
      if (c.length === 2) {
        const year = parseInt(c) > 50 ? `19${c}` : `20${c}`;
        return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
    }
    return null;
  }

  // ── Payment Method ────────────────────────────────────────────────────────
  private extractPaymentMethod(text: string): string | null {
    const t = text.toLowerCase();
    if (/\bupi\b|gpay|phonepe|paytm|bhim/.test(t)) return 'upi';
    if (/\bcredit\s*card\b|\bdebit\s*card\b|\bcard\b/.test(t)) return 'card';
    if (/\bcheque\b|\bcheck\b/.test(t)) return 'cheque';
    if (/\bneft\b|\brtgs\b|\bimps\b|\bbank\s*transfer\b|\bwire\b/.test(t)) return 'bank_transfer';
    if (/\bcash\b/.test(t)) return 'cash';
    return null;
  }

  // ── Reference / Invoice No ────────────────────────────────────────────────
  private extractReferenceNo(text: string): string | null {
    const patterns = [
      /(?:invoice\s*(?:no|num|number|#)|inv\s*(?:no|#)|receipt\s*(?:no|#)|ref(?:erence)?\s*(?:no|#)?)[:\s#]*([\w\-\/]+)/i,
      /\b(INV[-\/][\w\-]+)\b/i,
      /\b(REC[-\/][\w\-]+)\b/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1]?.length >= 3) return m[1].trim();
    }
    return null;
  }

  // ── Description (vendor name from top lines) ──────────────────────────────
  private extractDescription(lines: string[]): string | null {
    // First non-trivial line is usually the vendor/company name
    const skip = /^(invoice|receipt|bill|tax\s*invoice|gst|date|phone|email|address|to:|from:|page)/i;
    for (const line of lines.slice(0, 8)) {
      if (line.length >= 3 && line.length <= 80 && !skip.test(line) && /[a-zA-Z]/.test(line)) {
        return line;
      }
    }
    return null;
  }

  // ── Category (heuristic keyword match) ───────────────────────────────────
  private extractCategory(text: string): string | null {
    const t = text.toLowerCase();
    const map: [RegExp, string][] = [
      [/\b(hotel|stay|accommodation|lodge|inn|resort)\b/, 'travel'],
      [/\b(flight|airline|airfare|train|bus|cab|taxi|uber|ola|transport|travel)\b/, 'travel'],
      [/\b(restaurant|food|meal|lunch|dinner|breakfast|cafe|coffee|swiggy|zomato)\b/, 'meals'],
      [/\b(office|stationery|printer|ink|paper|supplies)\b/, 'office'],
      [/\b(laptop|computer|phone|mobile|software|subscription|aws|azure|cloud|saas)\b/, 'technology'],
      [/\b(medical|pharmacy|hospital|clinic|health|medicine|doctor)\b/, 'medical'],
      [/\b(training|course|seminar|conference|workshop|education|book)\b/, 'training'],
      [/\b(advertising|marketing|promotion|ads|campaign)\b/, 'marketing'],
      [/\b(electricity|internet|broadband|water|utility|telecom)\b/, 'utilities'],
    ];
    for (const [re, cat] of map) {
      if (re.test(t)) return cat;
    }
    return null;
  }
}
