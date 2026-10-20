const MONEY_DECIMALS = 2;
const QUANTITY_DECIMALS = 3;
const PERCENT_DECIMALS = 2;
const BASIS_POINT_DIVISOR = 10_000n;

function decimalToScaledBigInt(value, decimals, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${label} is required.`);
  }
  if (typeof value === 'boolean') throw new Error(`${label} must be a number.`);

  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative decimal number.`);
  }

  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) {
    throw new Error(`${label} supports at most ${decimals} decimal places.`);
  }

  const scale = 10n ** BigInt(decimals);
  const paddedFraction = fraction.padEnd(decimals, '0');
  return (BigInt(whole) * scale) + BigInt(paddedFraction || '0');
}

function toSafeNumber(value, label) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large.`);
  }
  return Number(value);
}

function roundDivide(numerator, denominator) {
  return (numerator + (denominator / 2n)) / denominator;
}

export function moneyToMinor(value, label = 'Amount') {
  return toSafeNumber(decimalToScaledBigInt(value, MONEY_DECIMALS, label), label);
}

export function quantityToMilli(value, label = 'Quantity') {
  const scaled = decimalToScaledBigInt(value, QUANTITY_DECIMALS, label);
  if (scaled === 0n) throw new Error(`${label} must be greater than zero.`);
  return toSafeNumber(scaled, label);
}

export function percentToBasisPoints(value = 0, label = 'Percentage') {
  const scaled = decimalToScaledBigInt(value, PERCENT_DECIMALS, label);
  if (scaled > BASIS_POINT_DIVISOR) throw new Error(`${label} must not exceed 100%.`);
  return Number(scaled);
}

export function minorToMoney(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Minor-unit amount is invalid.');
  return number / 100;
}

export function milliToQuantity(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Scaled quantity is invalid.');
  return number / 1000;
}

export function calculateCommercialLine({
  quantity,
  unitRate,
  discountPercent = 0,
  taxRatePercent = 0,
}) {
  const quantityMilli = quantityToMilli(quantity);
  const unitRateMinor = moneyToMinor(unitRate, 'Unit rate');
  const discountBasisPoints = percentToBasisPoints(discountPercent, 'Line discount');
  const taxRateBasisPoints = percentToBasisPoints(taxRatePercent, 'Tax rate');

  const subtotal = roundDivide(
    BigInt(quantityMilli) * BigInt(unitRateMinor),
    1000n,
  );
  const discount = roundDivide(subtotal * BigInt(discountBasisPoints), BASIS_POINT_DIVISOR);
  const taxable = subtotal - discount;
  const tax = roundDivide(taxable * BigInt(taxRateBasisPoints), BASIS_POINT_DIVISOR);
  const total = taxable + tax;

  return {
    quantity: milliToQuantity(quantityMilli),
    quantityMilli,
    unitRateMinor,
    lineSubtotalMinor: toSafeNumber(subtotal, 'Line subtotal'),
    discountBasisPoints,
    discountMinor: toSafeNumber(discount, 'Line discount'),
    taxableMinor: toSafeNumber(taxable, 'Line taxable amount'),
    taxRateBasisPoints,
    taxMinor: toSafeNumber(tax, 'Line tax'),
    lineTotalMinor: toSafeNumber(total, 'Line total'),
  };
}

export function calculateQuotationTotals(lineItems) {
  if (!Array.isArray(lineItems) || !lineItems.length) {
    throw new Error('At least one quotation line item is required.');
  }

  const computedLineItems = lineItems.map((item) => ({
    ...item,
    ...calculateCommercialLine(item),
  }));

  const totals = computedLineItems.reduce((summary, item) => ({
    subtotalMinor: summary.subtotalMinor + item.lineSubtotalMinor,
    discountMinor: summary.discountMinor + item.discountMinor,
    taxableMinor: summary.taxableMinor + item.taxableMinor,
    taxMinor: summary.taxMinor + item.taxMinor,
    grandTotalMinor: summary.grandTotalMinor + item.lineTotalMinor,
  }), {
    subtotalMinor: 0,
    discountMinor: 0,
    taxableMinor: 0,
    taxMinor: 0,
    grandTotalMinor: 0,
  });

  for (const [label, amount] of Object.entries(totals)) {
    if (!Number.isSafeInteger(amount)) throw new Error(`${label} is too large.`);
  }

  const taxBreakdownMap = new Map();
  for (const item of computedLineItems) {
    const key = item.taxRateBasisPoints;
    const current = taxBreakdownMap.get(key) || { taxableMinor: 0, taxMinor: 0 };
    current.taxableMinor += item.taxableMinor;
    current.taxMinor += item.taxMinor;
    taxBreakdownMap.set(key, current);
  }

  const taxBreakdown = [...taxBreakdownMap.entries()]
    .sort(([left], [right]) => left - right)
    .map(([taxRateBasisPoints, amounts]) => ({ taxRateBasisPoints, ...amounts }));

  return { lineItems: computedLineItems, totals, taxBreakdown };
}
