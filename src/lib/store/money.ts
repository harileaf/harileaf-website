/**
 * Money helpers. All amounts are integer paise (₹1 = 100 paise) and
 * GST-inclusive unless a name says otherwise.
 */

export type Paise = number;

export function assertPaise(n: number): Paise {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`not a paise amount: ${n}`);
  return n;
}

/** Indian digit grouping: 1234567 → "12,34,567". */
function groupIndian(rupees: number): string {
  const s = String(rupees);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** 69900 → "₹699", 69950 → "₹699.50", 13490000 → "₹1,34,900". */
export function formatINR(p: Paise): string {
  assertPaise(p);
  const rupees = Math.floor(p / 100);
  const paise = p % 100;
  return `₹${groupIndian(rupees)}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}

/** Indian system: crore (10^7), lakh (10^5), thousand, hundred. */
function integerWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** For invoices: 134950 → "Rupees One Thousand Three Hundred Forty Nine and Fifty Paise Only". */
export function amountInWords(p: Paise): string {
  assertPaise(p);
  const rupees = Math.floor(p / 100);
  const paise = p % 100;
  return `Rupees ${integerWords(rupees)}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}

/** Unit sale price per kg (Legal Metrology) for a pack of `unitQtyG` grams. */
export function unitPricePerKg(price: Paise, unitQtyG: number): Paise {
  assertPaise(price);
  if (!Number.isFinite(unitQtyG) || unitQtyG <= 0) throw new RangeError(`bad pack size: ${unitQtyG}`);
  return Math.round((price * 1000) / unitQtyG);
}
