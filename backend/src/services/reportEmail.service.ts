import type { OrderRepository } from '../repositories/types';
import type { CheckerService } from './checker.service';
import { buildReportEmail, EmailSender } from './email.service';

export interface ReportEmailDeps {
  orders: OrderRepository;
  checker: Pick<CheckerService, 'renderPdfForPaidReport'>;
  sender: EmailSender;
  siteName: string;
  supportEmail: string;
  supportWhatsapp: string;
  now?: () => Date;
}

/** Emails the PDF to the address collected at checkout and records the outcome on the order. Never throws. */
export class ReportEmailService {
  constructor(private readonly d: ReportEmailDeps) {}

  async deliver(reportId: string): Promise<'sent' | 'failed' | 'skipped'> {
    const order = await this.d.orders.get(reportId);
    if (!order) return 'failed';
    if (!this.d.sender.enabled) {
      await this.d.orders.update(reportId, { emailStatus: 'skipped' });
      return 'skipped';
    }
    try {
      const pdf = await this.d.checker.renderPdfForPaidReport(reportId);
      if (!pdf) throw new Error('report expired');
      const msg = buildReportEmail({ siteName: this.d.siteName, candidateName: order.candidateName, supportEmail: this.d.supportEmail, supportWhatsapp: this.d.supportWhatsapp, qualifyingCount: pdf.qualifyingCount });
      await this.d.sender.send({ to: order.email, ...msg, attachments: [{ filename: pdf.filename, content: pdf.bytes }] });
      await this.d.orders.update(reportId, { emailStatus: 'sent', emailSentAt: (this.d.now ?? (() => new Date()))() });
      return 'sent';
    } catch {
      await this.d.orders.update(reportId, { emailStatus: 'failed' });
      return 'failed';
    }
  }
}
