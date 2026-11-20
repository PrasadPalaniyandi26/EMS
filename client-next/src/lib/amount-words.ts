// An amount in rupees in words, in the Indian way (lakh and crore), as the tax invoice prints it:
// 4830596 becomes "Rupees Forty Eight Lakhs Thirty Thousand Five Hundred and Ninety Six only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` and ${below100(n % 100)}` : ''}` : below100(n));
const unit = (n: number, one: string) => `${below1000(n)} ${one}${n > 1 ? 's' : ''}`;

export function rupeesInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - whole) * 100);
  if (whole === 0 && paise === 0) return 'Rupees Zero only';
  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000); const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000); const rest = whole % 1000;
  if (crore) parts.push(unit(crore, 'Crore'));
  if (lakh) parts.push(unit(lakh, 'Lakh'));
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  // "and" goes before the last words when something larger came first: "One Lakh and Fifty"
  if (rest) parts.push(parts.length && rest < 100 ? `and ${below100(rest)}` : below1000(rest));
  const rupees = whole ? `Rupees ${parts.join(' ')}` : '';
  const ps = paise ? `${whole ? ' and ' : ''}${below100(paise)} Paise` : '';
  return `${rupees}${ps} only`;
}
