/**
 * GST state / union territory codes (first two digits of a GSTIN) — used for
 * the place of supply on invoices (CGST+SGST vs IGST) and checkout addresses.
 */
export const INDIA_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
];

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

const ALIASES: Record<string, string> = {
  nctofdelhi: '07', newdelhi: '07', orissa: '21', pondicherry: '34', uttaranchal: '05', jandk: '01',
  andamanandnicobar: '35', damananddiu: '26', dadraandnagarhaveli: '26', dnhanddd: '26',
};

export function stateCodeFor(name: string): string | null {
  const n = norm(name);
  if (!n) return null;
  return INDIA_STATES.find((s) => norm(s.name) === n)?.code ?? ALIASES[n] ?? null;
}

export function stateName(code: string): string | null {
  return INDIA_STATES.find((s) => s.code === code)?.name ?? null;
}

export const isStateCode = (code: string) => INDIA_STATES.some((s) => s.code === code);
