/**
 * Indian States & Union Territories with official 2-digit GST State Codes.
 */
export const INDIAN_GST_STATES = [
  { name: 'ANDHRA PRADESH', code: '37' },
  { name: 'TELANGANA', code: '36' },
  { name: 'KARNATAKA', code: '29' },
  { name: 'TAMIL NADU', code: '33' },
  { name: 'MAHARASHTRA', code: '27' },
  { name: 'GUJARAT', code: '24' },
  { name: 'KERALA', code: '32' },
  { name: 'DELHI', code: '07' },
  { name: 'WEST BENGAL', code: '19' },
  { name: 'RAJASTHAN', code: '08' },
  { name: 'UTTAR PRADESH', code: '09' },
  { name: 'MADHYA PRADESH', code: '23' },
  { name: 'PUNJAB', code: '03' },
  { name: 'HARYANA', code: '06' },
  { name: 'BIHAR', code: '10' },
  { name: 'ODISHA', code: '21' },
  { name: 'JHARKHAND', code: '20' },
  { name: 'CHHATTISGARH', code: '22' },
  { name: 'GOA', code: '30' },
  { name: 'ASSAM', code: '18' },
  { name: 'HIMACHAL PRADESH', code: '02' },
  { name: 'JAMMU AND KASHMIR', code: '01' },
  { name: 'UTTARAKHAND', code: '05' },
  { name: 'PUDUCHERRY', code: '34' },
  { name: 'CHANDIGARH', code: '04' },
  { name: 'LADAKH', code: '38' },
  { name: 'ARUNACHAL PRADESH', code: '12' },
  { name: 'MANIPUR', code: '14' },
  { name: 'MEGHALAYA', code: '17' },
  { name: 'MIZORAM', code: '15' },
  { name: 'NAGALAND', code: '13' },
  { name: 'TRIPURA', code: '16' },
  { name: 'SIKKIM', code: '11' },
  { name: 'ANDAMAN AND NICOBAR ISLANDS', code: '35' },
  { name: 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU', code: '26' },
  { name: 'LAKSHADWEEP', code: '31' },
];

/**
 * Returns state code for a given state name (case-insensitive match).
 */
export function getStateCodeByName(name) {
  if (!name) return '';
  const clean = name.trim().toUpperCase();
  const found = INDIAN_GST_STATES.find(s => s.name === clean || clean.includes(s.name) || s.name.includes(clean));
  return found ? found.code : '';
}

/**
 * Returns state name for a given 2-digit state code.
 */
export function getStateNameByCode(code) {
  if (!code) return '';
  const clean = String(code).trim().padStart(2, '0');
  const found = INDIAN_GST_STATES.find(s => s.code === clean);
  return found ? found.name : '';
}
