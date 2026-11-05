export const DISPATCH_STATUS_STYLES = Object.freeze({
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  READY_TO_DISPATCH: 'bg-amber-50 text-amber-800 border-amber-200',
  DISPATCHED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-800 border-rose-200',
});

export const TRANSPORT_MODES = [
  { value: 'BY_LORRY', label: 'By Lorry' },
  { value: 'ROAD', label: 'Road Logistics' },
  { value: 'RAIL', label: 'Rail Freight' },
  { value: 'AIR', label: 'Air Cargo' },
  { value: 'OCEAN', label: 'Ocean Freight' },
  { value: 'CUSTOMER_PICKUP', label: 'Customer Pickup' },
  { value: 'OTHER', label: 'Other' },
];

export function labelDispatchStatus(status) {
  switch (status) {
    case 'DRAFT': return 'Draft';
    case 'READY_TO_DISPATCH': return 'Ready to Dispatch';
    case 'DISPATCHED': return 'Dispatched';
    case 'CANCELLED': return 'Cancelled';
    default: return status || 'Unknown';
  }
}

export function labelTransportMode(mode) {
  const match = TRANSPORT_MODES.find((m) => m.value === mode);
  return match ? match.label : mode || 'By Lorry';
}

export async function parseDispatchResponse(response, fallbackMessage = 'Dispatch request failed') {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage);
  }
  return body;
}

