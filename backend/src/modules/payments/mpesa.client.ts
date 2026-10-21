/**
 * Safaricom Daraja (M-Pesa Express / STK push) client. Uses fetch only (no SDK).
 * Credentials come from environment variables; nothing is logged.
 */
export interface MpesaConfig {
  env: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  partyB: string;
  callbackUrl: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
}

export type StkQueryResult =
  | { state: 'paid' }
  | { state: 'failed'; code: string; reason: string }
  | { state: 'pending' };

export interface MpesaClient {
  readonly configured: boolean;
  stkPush(input: { phone: string; amount: number; accountReference: string; description: string }): Promise<StkPushResult>;
  stkQuery(checkoutRequestId: string): Promise<StkQueryResult>;
}

/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time. */
export function darajaTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}${g('month')}${g('day')}${g('hour')}${g('minute')}${g('second')}`;
}

export function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export class PaymentUnavailableError extends Error {}
export class MpesaRequestError extends Error {}

export class DarajaClient implements MpesaClient {
  readonly configured = true;
  private token: { value: string; exp: number } | null = null;
  constructor(private readonly cfg: MpesaConfig, private readonly fetchFn: typeof fetch = fetch) {}

  private get base() {
    return this.cfg.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const res = await this.fetchFn(`${this.base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new MpesaRequestError(`M-Pesa authentication failed (${res.status})`);
    const j = (await res.json()) as { access_token?: string; expires_in?: string };
    if (!j.access_token) throw new MpesaRequestError('M-Pesa authentication returned no token');
    this.token = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
    return j.access_token;
  }

  private async post<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: T }> {
    const token = await this.accessToken();
    const res = await this.fetchFn(`${this.base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
    let json = {} as T;
    try { json = (await res.json()) as T; } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, json };
  }

  async stkPush(i: { phone: string; amount: number; accountReference: string; description: string }): Promise<StkPushResult> {
    const ts = darajaTimestamp();
    const r = await this.post<{ CheckoutRequestID?: string; MerchantRequestID?: string; ResponseCode?: string; CustomerMessage?: string; errorMessage?: string }>('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.cfg.shortcode,
      Password: darajaPassword(this.cfg.shortcode, this.cfg.passkey, ts),
      Timestamp: ts,
      TransactionType: this.cfg.transactionType,
      Amount: i.amount,
      PartyA: i.phone,
      PartyB: this.cfg.partyB,
      PhoneNumber: i.phone,
      CallBackURL: this.cfg.callbackUrl,
      AccountReference: i.accountReference.slice(0, 12),
      TransactionDesc: i.description.slice(0, 13),
    });
    if (!r.ok || r.json.ResponseCode !== '0' || !r.json.CheckoutRequestID) {
      throw new MpesaRequestError(r.json.errorMessage ?? 'M-Pesa could not start the payment');
    }
    return { checkoutRequestId: r.json.CheckoutRequestID, merchantRequestId: r.json.MerchantRequestID ?? '', customerMessage: r.json.CustomerMessage ?? 'Check your phone for the M-Pesa prompt.' };
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const ts = darajaTimestamp();
    const r = await this.post<{ ResultCode?: string | number; ResultDesc?: string }>('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.cfg.shortcode,
      Password: darajaPassword(this.cfg.shortcode, this.cfg.passkey, ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    });
    // While the customer is still deciding Daraja answers with an error status: treat as pending.
    if (!r.ok || r.json.ResultCode === undefined) return { state: 'pending' };
    const code = String(r.json.ResultCode);
    if (code === '0') return { state: 'paid' };
    return { state: 'failed', code, reason: r.json.ResultDesc ?? 'The payment was not completed' };
  }
}

/** Used when M-Pesa is not configured: payments are unavailable (never silently free). */
export class DisabledMpesaClient implements MpesaClient {
  readonly configured = false;
  async stkPush(): Promise<StkPushResult> { throw new PaymentUnavailableError('M-Pesa is not configured'); }
  async stkQuery(): Promise<StkQueryResult> { throw new PaymentUnavailableError('M-Pesa is not configured'); }
}
