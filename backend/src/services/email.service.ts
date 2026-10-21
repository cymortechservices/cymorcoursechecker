/**
 * Transactional email over an HTTPS API (Brevo). SMTP is not used because Render's free tier blocks SMTP ports.
 * If no API key/sender is configured the sender reports itself as disabled and nothing is sent.
 */
export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
}
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}
export interface EmailSender {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
}

export class BrevoEmailSender implements EmailSender {
  readonly enabled = true;
  constructor(private readonly apiKey: string, private readonly fromEmail: string, private readonly fromName: string, private readonly fetchFn: typeof fetch = fetch) {}
  async send(m: EmailMessage): Promise<void> {
    const res = await this.fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: this.fromName, email: this.fromEmail },
        to: [{ email: m.to }],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        ...(m.attachments?.length ? { attachment: m.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (${res.status})`);
  }
}

export class DisabledEmailSender implements EmailSender {
  readonly enabled = false;
  async send(): Promise<void> { /* intentionally nothing */ }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function buildReportEmail(input: { siteName: string; candidateName?: string; supportEmail: string; supportWhatsapp: string; qualifyingCount: number }): { subject: string; html: string; text: string } {
  const hello = input.candidateName ? `Hello ${input.candidateName},` : 'Hello,';
  const wa = input.supportWhatsapp.replace(/^0/, '254').replace(/\D/g, '');
  const text = `${hello}\n\nThank you for using ${input.siteName}. Your KCSE degree eligibility report is attached as a PDF so you can keep it for future reference. It lists ${input.qualifyingCount} qualifying programme option(s), starting with your recommended application choices.\n\nScores are estimates; always confirm requirements on the official KUCCPS portal.\n\nNeed help? Email ${input.supportEmail} or WhatsApp ${input.supportWhatsapp}.\n\nAll the best in your future education,\nLegendary Smiley Cymor`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#0F172A">
  <div style="background:#0B132B;color:#fff;padding:24px;border-radius:16px 16px 0 0"><div style="color:#22D3EE;font-weight:700;letter-spacing:2px;font-size:12px">CYMOR</div><div style="font-size:22px;font-weight:800">CourseChecker</div></div>
  <div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 16px 16px">
    <p>${esc(hello)}</p>
    <p>Thank you for using ${esc(input.siteName)}. Your KCSE degree eligibility report is <strong>attached as a PDF</strong> so you can keep it for future reference. It lists <strong>${input.qualifyingCount}</strong> qualifying programme option(s), starting with your recommended application choices.</p>
    <p style="font-size:13px;color:#475569">Scores are estimates. Always confirm requirements and placement rules on the official KUCCPS portal.</p>
    <p>Need help? <a href="mailto:${esc(input.supportEmail)}">${esc(input.supportEmail)}</a> or <a href="https://wa.me/${wa}">WhatsApp ${esc(input.supportWhatsapp)}</a>.</p>
    <p style="margin-top:24px">All the best in your future education,<br><strong>Legendary Smiley Cymor</strong></p>
  </div></div>`;
  return { subject: 'Your KCSE degree eligibility report', html, text };
}
