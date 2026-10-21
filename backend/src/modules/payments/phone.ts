/** Kenyan mobile number normalisation for M-Pesa (Safaricom accepts 2547XXXXXXXX / 2541XXXXXXXX). */
export function normaliseKenyanPhone(input: string): string | null {
  const d = input.replace(/[\s()-]/g, '');
  let n: string;
  if (/^\+?254[17]\d{8}$/.test(d)) n = d.replace(/^\+/, '');
  else if (/^0[17]\d{8}$/.test(d)) n = `254${d.slice(1)}`;
  else if (/^[17]\d{8}$/.test(d)) n = `254${d}`;
  else return null;
  return n;
}

/** "254712345678" -> "2547******78": enough to recognise, not enough to misuse. */
export function maskPhone(msisdn: string): string {
  return `${msisdn.slice(0, 4)}${'*'.repeat(Math.max(0, msisdn.length - 6))}${msisdn.slice(-2)}`;
}
