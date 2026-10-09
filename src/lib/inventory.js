export const INVENTORY_MODES = Object.freeze([
  { value: 'BATCH', label: 'Batch quantity' },
  { value: 'INDIVIDUAL_SLAB', label: 'Individual slabs' },
]);

export const INVENTORY_MODE_LABELS = Object.freeze(
  Object.fromEntries(INVENTORY_MODES.map(({ value, label }) => [value, label])),
);

export const INVENTORY_STATUSES = Object.freeze([
  { value: 'DRAFT', label: 'Draft' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'HOLD', label: 'On hold' },
  { value: 'DEPLETED', label: 'Depleted' },
  { value: 'ARCHIVED', label: 'Archived' },
]);

export const INVENTORY_STATUS_LABELS = Object.freeze(
  Object.fromEntries(INVENTORY_STATUSES.map(({ value, label }) => [value, label])),
);

export const INVENTORY_STATUS_STYLES = Object.freeze({
  DRAFT: 'border-stone-300 bg-stone-100 text-stone-700',
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  HOLD: 'border-amber-200 bg-amber-50 text-amber-900',
  DEPLETED: 'border-rose-200 bg-rose-50 text-rose-800',
  ARCHIVED: 'border-slate-300 bg-slate-100 text-slate-600',
});

export const MOVEMENT_TYPE_LABELS = Object.freeze({
  RECEIPT: 'Receipt',
  ADJUSTMENT_IN: 'Adjustment in',
  ADJUSTMENT_OUT: 'Adjustment out',
  TRANSFER: 'Transfer',
});

export function labelInventoryMode(value) {
  return INVENTORY_MODE_LABELS[value] || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function labelInventoryStatus(value) {
  return INVENTORY_STATUS_LABELS[value] || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function labelMovementType(value) {
  return MOVEMENT_TYPE_LABELS[value] || String(value || 'Movement').replaceAll('_', ' ').toLowerCase();
}

export function formatInventoryDate(value, { includeTime = false } = {}) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatInventoryNumber(value, { maximumFractionDigits = 2 } = {}) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not recorded';
  return number.toLocaleString('en-IN', { maximumFractionDigits });
}

export function formatInventoryCurrency(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return 'Not recorded';
  const number = Number(amount);
  const code = String(currency || '').trim().toUpperCase();
  if (!Number.isFinite(number)) return 'Not recorded';
  if (!code) return `${number.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (currency not recorded)`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${code} ${number.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

export function formatInventoryLocation(location) {
  if (!location || typeof location !== 'object') return 'Not recorded';
  const parts = [location.warehouse, location.zone, location.rack]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Not recorded';
}

export function batchStone(batch) {
  return batch?.stoneRef || batch?.stone || {};
}

export function batchInventoryMode(batch) {
  return batch?.inventoryMode || batch?.trackingMode || '';
}

export function batchQuantityOnHand(batch) {
  return batch?.quantity?.currentCount ?? batch?.quantityOnHand ?? batch?.currentCount;
}

export function batchQuantityReceived(batch) {
  return batch?.quantity?.receivedCount ?? batch?.quantityReceived ?? batch?.receivedCount;
}

export function batchAreaOnHand(batch) {
  return batch?.area?.availableSqFt ?? batch?.areaOnHandSqFt ?? batch?.availableSqFt;
}

export function batchAreaReceived(batch) {
  return batch?.area?.receivedSqFt ?? batch?.areaReceivedSqFt ?? batch?.receivedSqFt;
}

export function batchCost(batch) {
  const source = batch?.cost || batch?.valuation || {};
  return {
    amount: source.costPerSqFt ?? source.cost,
    currency: source.currency || source.costCurrency,
  };
}

export function batchSelling(batch) {
  const source = batch?.selling || batch?.valuation || {};
  return {
    amount: source.pricePerSqFt ?? source.sellingPricePerSqFt,
    currency: source.currency || source.sellingCurrency,
  };
}

export function slabDimensions(slab) {
  return slab?.dimensions || {
    lengthMm: slab?.lengthMm,
    widthMm: slab?.widthMm,
    thicknessMm: slab?.thicknessMm,
  };
}

export async function parseInventoryResponse(response, fallbackMessage = 'The inventory request could not be completed.') {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  const error = new Error(data.error || data.message || fallbackMessage);
  error.status = response.status;
  throw error;
}

export function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== '' && entry !== null && entry !== undefined),
  );
}
