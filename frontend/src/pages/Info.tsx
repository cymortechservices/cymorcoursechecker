import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const Page = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mx-auto max-w-3xl px-4 py-14">
    <h1 className="font-display text-4xl font-extrabold text-ink">{title}</h1>
    <div className="mt-3 h-1 w-20 rounded bg-gradient-to-r from-violet-600 to-cyan-400" />
    <div className="mt-6 space-y-4 leading-relaxed text-slate-700">{children}</div>
  </div>
);

export const Methodology = () => (
  <Page title="How results are produced">
    <p>A programme appears only if (1) your grades meet its published minimum subject requirements and (2) your estimated cluster score is equal to or above the cutoff.</p>
    <p><strong>Cluster score:</strong> C = √((r/48) × (t/84)) × 48, where r is your points in the four subjects the programme's cluster asks for and t is your aggregate of seven subjects: Mathematics (compulsory), the better of English and Kiswahili, and your best five of the remaining subjects. Grades use the 12-point scale (A = 12 … E = 1).</p>
    <p><strong>Important:</strong> this formula and the aggregate rule come from published guides, not from the KUCCPS PDFs used here, so scores are estimates. Subject groups follow the usual KNEC convention.</p>
    <p><strong>Cutoffs:</strong> we prefer the newest cutoff specific to each university. Some years print one identical value for many universities; those are marked "shared minimum" and never presented as university-specific. A missing cutoff is never treated as zero.</p>
    <p>Reports list your recommended application choices first, then all qualifying programmes from the highest cutoff to the lowest.</p>
    <Link className="btn btn-primary" to="/check">Check my courses</Link>
  </Page>
);

export const Privacy = () => (
  <Page title="Privacy">
    <p>No account is needed. Your grades are used to compute results and are stored with a random report ID so you can download your PDF. The name and reference you enter are optional.</p>
    <p>Reports are deleted automatically after the retention period shown on the results page. Access needs a private token that is kept only in your browser tab and is never placed in a web address.</p>
    <p>We do not sell data and do not store your IP address in reports. Basic request logs contain only the method, path and status.</p>
  </Page>
);

export const NotFound = () => (
  <Page title="Page not found"><p>That page does not exist.</p><Link className="btn btn-primary" to="/">Go home</Link></Page>
);
