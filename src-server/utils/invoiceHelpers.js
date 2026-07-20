/**
 * Invoice business logic helpers.
 * All pure functions — no DB calls, no side effects.
 */

// ─────────────────────────────────────────────────
// 1. Financial Year helpers
// ─────────────────────────────────────────────────

/**
 * Returns the financial year string for a given date.
 * Indian FY: April 1 → March 31.
 * e.g. 2025-01-13  →  "2025-26"
 *      2025-04-01  →  "2025-26"
 *      2026-04-01  →  "2026-27"
 */
export function getFY(date) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-indexed
  const year = d.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fyEndShort = String(fyStart + 1).slice(-2); // "26"
  return `${fyStart}-${fyEndShort}`; // "2025-26"
}

/**
 * Counter key used in the Counters collection.
 * e.g. "invoices_2025-26"
 */
export function counterKey(fy) {
  return `invoices_${fy}`;
}

// ─────────────────────────────────────────────────
// 2. Tax logic
// ─────────────────────────────────────────────────

/**
 * Derive tax type from buyer vs seller state codes.
 * Same state → CGST + SGST (split).
 * Different state → IGST (full rate).
 */
export function deriveTaxType(buyerStateCode, sellerStateCode) {
  return String(buyerStateCode) === String(sellerStateCode)
    ? 'CGST_SGST'
    : 'IGST';
}

// ─────────────────────────────────────────────────
// 3. Amount in Words — Indian numbering system
// ─────────────────────────────────────────────────

const ones = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];

const tens = [
  '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY',
  'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY',
];

function belowHundred(n) {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
}

function belowThousand(n) {
  if (n < 100) return belowHundred(n);
  return ones[Math.floor(n / 100)] + ' HUNDRED' +
    (n % 100 !== 0 ? ' ' + belowHundred(n % 100) : '');
}

/**
 * Converts a non-negative integer to Indian number words.
 * Handles crores and lakhs.
 */
function intToWords(n) {
  if (n === 0) return 'ZERO';
  let result = '';

  if (n >= 1_00_00_000) { // crore
    result += intToWords(Math.floor(n / 1_00_00_000)) + ' CRORE ';
    n %= 1_00_00_000;
  }
  if (n >= 1_00_000) { // lakh
    result += intToWords(Math.floor(n / 1_00_000)) + ' LAKH ';
    n %= 1_00_000;
  }
  if (n >= 1_000) { // thousand
    result += belowThousand(Math.floor(n / 1_000)) + ' THOUSAND ';
    n %= 1_000;
  }
  if (n > 0) {
    result += belowThousand(n);
  }
  return result.trim();
}

/**
 * Converts a rupee amount (possibly with paise) to Indian words.
 * e.g. 14868    → "FOURTEEN THOUSAND EIGHT HUNDRED SIXTY EIGHT RUPEES ONLY"
 *      14868.50 → "FOURTEEN THOUSAND EIGHT HUNDRED SIXTY EIGHT RUPEES AND FIFTY PAISE ONLY"
 */
export function amountInWords(amount) {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  let words = intToWords(rupees) + ' RUPEES';
  if (paise > 0) {
    words += ' AND ' + intToWords(paise) + ' PAISE';
  }
  return words + ' ONLY';
}

// ─────────────────────────────────────────────────
// 4. Server-side totals computation
// ─────────────────────────────────────────────────

/**
 * Recomputes all totals from raw line items.
 * Returns { lineItems (with amount), taxableValue, taxAmount, grandTotal }.
 */
export function computeTotals(lineItems, taxRate) {
  const computed = lineItems.map(item => ({
    ...item,
    amount: Math.round(Number(item.qty) * Number(item.rate) * 100) / 100,
  }));

  const taxableValue = computed.reduce((sum, i) => sum + i.amount, 0);
  const taxAmount = Math.round(taxableValue * (Number(taxRate) / 100) * 100) / 100;
  const grandTotal = Math.round((taxableValue + taxAmount) * 100) / 100;

  return { lineItems: computed, taxableValue, taxAmount, grandTotal };
}
