import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, Info, Loader2, Lock, Mail, MessageCircle, Phone, Search, Sparkles, Tag } from 'lucide-react';
import { ApiError, Choices, Page, PaymentState, PublicOption, Quote, ResultsQuery, RunResult, Summary, SummaryResult, Teaser, api, session } from '../lib/api';
import { DEFAULT_PRICE_KES, SUPPORT_EMAIL, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL, kes } from '../lib/site';

const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|And|In|The|For)\b/g, (m) => m.toLowerCase()) : s);
const level = (m: number) => (m >= 3 ? { t: 'Safe', c: 'bg-emerald-100 text-emerald-800' } : m >= 1 ? { t: 'Balanced', c: 'bg-amber-100 text-amber-800' } : { t: 'Competitive', c: 'bg-indigo-100 text-indigo-800' });

export default function Results() {
  const loc = useLocation() as { state?: { first?: RunResult } };
  const creds = session.load();
  const [teaser, setTeaser] = useState<Teaser | null>(loc.state?.first?.summary ?? null);
  const [pay, setPay] = useState<PaymentState | null>(loc.state?.first ? { status: 'unpaid', paid: false, listPrice: loc.state.first.payment.listPrice, amountDue: loc.state.first.payment.amountDue, couponCode: null } : null);
  const [loadErr, setLoadErr] = useState('');

  const refresh = useCallback(async () => {
    if (!creds) return;
    try {
      const s: SummaryResult = await api.summary(creds.reportId, creds.token);
      setTeaser(s.summary);
      if (s.payment) setPay(s.payment);
    } catch (e) { setLoadErr(e instanceof ApiError ? e.message : 'Could not load your report.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.reportId, creds?.token]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!creds) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold text-ink">No results to show</h1>
      <p className="mt-2 text-slate-600">Results are kept only for this browser tab. Start a new check to see your courses. If you already paid, your report was emailed to you.</p>
      <Link className="btn btn-primary mt-6" to="/check">Start a check</Link>
      <p className="mt-6 text-sm text-slate-500">Need help? <a className="underline" href={SUPPORT_WHATSAPP_URL}>WhatsApp {SUPPORT_WHATSAPP_DISPLAY}</a> or {SUPPORT_EMAIL}</p></div>
  );
  if (loadErr && !teaser) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold text-ink">We could not open this report</h1>
      <p role="alert" className="mt-2 text-slate-600">{loadErr}</p><Link className="btn btn-primary mt-6" to="/check">Start a new check</Link></div>
  );
  if (!teaser || !pay) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" aria-hidden /> Loading your report…</div>;

  return pay.paid
    ? <Unlocked creds={creds} />
    : <Locked creds={creds} teaser={teaser} pay={pay} onPay={setPay} />;
}

/* ------------------------------------------------------------------ locked */
function Locked({ creds, teaser, pay, onPay }: { creds: { reportId: string; token: string }; teaser: Teaser; pay: PaymentState; onPay: (p: PaymentState) => void }) {
  const [phone, setPhone] = useState('');
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [waiting, setWaiting] = useState(pay.status === 'pending');
  const [notice, setNotice] = useState(pay.status === 'pending' ? 'A payment prompt was sent to your phone. Enter your M-Pesa PIN to finish.' : '');
  const price = quote?.amountDue ?? pay.amountDue ?? DEFAULT_PRICE_KES;
  const list = pay.listPrice ?? DEFAULT_PRICE_KES;
  const timer = useRef<number | undefined>(undefined);

  // Poll payment status while a prompt is outstanding (also catches a payment finished in another tab).
  useEffect(() => {
    if (!waiting) return undefined;
    let n = 0;
    const tick = async () => {
      n += 1;
      try {
        const s = await api.paymentStatus(creds.reportId, creds.token);
        onPay(s);
        if (s.paid) { setWaiting(false); return; }
        if (s.status === 'failed' || s.status === 'cancelled') {
          setWaiting(false);
          setErr(s.status === 'cancelled' ? 'The payment was cancelled on your phone. You can try again.' : (s.failureReason ?? 'The payment did not go through. You can try again.'));
          return;
        }
      } catch { /* keep polling */ }
      if (n >= 40) { setWaiting(false); setNotice('We have not received confirmation yet. If you approved the prompt, wait a moment and press “I have paid”.'); return; }
      timer.current = window.setTimeout(tick, 3000);
    };
    timer.current = window.setTimeout(tick, 3000);
    return () => window.clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  async function applyCoupon() {
    setCouponMsg(''); setErr('');
    if (!coupon.trim()) { setQuote(null); return; }
    try { const q = await api.quote(creds.reportId, creds.token, coupon); setQuote(q); setCouponMsg(q.percentOff >= 100 ? 'Coupon applied: this report is free.' : `Coupon applied: ${q.percentOff}% off.`); }
    catch (e) { setQuote(null); setCouponMsg((e as Error).message); }
  }

  async function startPayment() {
    setBusy(true); setErr(''); setNotice('');
    try {
      const s = await api.pay(creds.reportId, creds.token, { phone: phone || undefined, couponCode: quote?.couponCode ?? undefined });
      onPay(s);
      if (!s.paid) { setNotice(s.message ?? 'Check your phone and enter your M-Pesa PIN.'); setWaiting(true); }
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  const free = quote?.amountDue === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} aria-hidden /> Your results are ready</span>
        <h1 className="mt-4 font-display text-4xl font-extrabold text-ink sm:text-5xl">You qualify for <span className="bg-gradient-to-r from-violet-600 to-cyan-500 bg-clip-text text-transparent">{teaser.qualifyingOptions}</span> programme{teaser.qualifyingOptions === 1 ? '' : 's'}</h1>
        <p className="mt-3 text-slate-600">Aggregate {teaser.aggregatePoints} / 84{teaser.estimatedMeanGrade ? ` · estimated mean grade ${teaser.estimatedMeanGrade}` : ''}</p>
      </motion.div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {([['Safe', teaser.byLevel.safe, 'bg-emerald-50 text-emerald-800 border-emerald-200'], ['Balanced', teaser.byLevel.balanced, 'bg-amber-50 text-amber-800 border-amber-200'], ['Competitive', teaser.byLevel.competitive, 'bg-indigo-50 text-indigo-800 border-indigo-200']] as const).map(([k, v, c], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className={`rounded-2xl border p-4 text-center ${c}`}>
            <div className="font-display text-4xl font-extrabold">{v}</div><div className="text-sm font-semibold">{k} options</div>
          </motion.div>
        ))}
      </div>

      {/* blurred preview: placeholder rows only, no real data is sent before payment */}
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-hidden>
        <div className="space-y-3 p-5 blur-[6px] select-none">
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center justify-between gap-3"><div className="space-y-2"><div className="h-4 w-56 rounded bg-slate-300" /><div className="h-3 w-40 rounded bg-slate-200" /></div><div className="h-6 w-16 rounded bg-violet-200" /></div>)}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/50"><span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"><Lock size={15} /> Programme list, recommended choices and PDF are locked</span></div>
      </div>

      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card mt-6 p-6 shadow-xl sm:p-8" aria-labelledby="unlock">
        <h2 id="unlock" className="font-display text-2xl font-extrabold text-ink">Unlock everything</h2>
        <ul className="mt-3 space-y-1.5 text-slate-700">
          {['Every programme you qualify for, highest cutoff first', 'Your six recommended application choices (your preferred courses first)', 'Beautiful PDF report, also emailed to you'].map((t) => <li key={t} className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />{t}</li>)}
        </ul>
        <div className="mt-5 flex items-baseline gap-3">
          <span className="font-display text-4xl font-extrabold text-ink">{kes(price)}</span>
          {price !== list && <span className="text-lg text-slate-400 line-through">{kes(list)}</span>}
          <span className="text-sm text-slate-500">one-time</span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="flex items-center gap-1.5 font-medium text-ink"><Tag size={15} aria-hidden /> Coupon code <span className="text-sm font-normal text-slate-500">(optional)</span></span>
            <div className="mt-1 flex gap-2"><input className="input uppercase" value={coupon} onChange={(e) => { setCoupon(e.target.value); setQuote(null); setCouponMsg(''); }} maxLength={30} placeholder="CODE" autoComplete="off" />
              <button type="button" className="btn btn-ghost px-4" onClick={applyCoupon} disabled={!coupon.trim()}>Apply</button></div></label>
          {!free && <label className="block"><span className="flex items-center gap-1.5 font-medium text-ink"><Phone size={15} aria-hidden /> M-Pesa number</span>
            <input className="input mt-1" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" autoComplete="tel" /></label>}
        </div>
        {couponMsg && <p role="status" className={`mt-2 text-sm ${quote ? 'text-emerald-700' : 'text-red-700'}`}>{couponMsg}</p>}

        <button type="button" className="btn btn-primary mt-6 w-full py-4 text-lg" onClick={startPayment} disabled={busy || waiting || (!free && phone.trim().length < 9)}>
          {busy || waiting ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles size={20} aria-hidden />}
          {waiting ? 'Waiting for your M-Pesa PIN…' : free ? 'Unlock for free' : `Pay ${kes(price)} with M-Pesa`}
        </button>
        <AnimatePresence>
          {notice && <motion.p role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl bg-violet-50 p-3 text-sm text-violet-900">{notice}</motion.p>}
          {err && <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</motion.p>}
        </AnimatePresence>
        {!waiting && pay.status === 'pending' && <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setWaiting(true)}>I have paid</button>}
        {notice.includes('have not received') && <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => { setNotice(''); setWaiting(true); }}>I have paid: check again</button>}
        <p className="mt-4 text-center text-sm text-slate-500">Payment problem? <a className="inline-flex items-center gap-1 font-semibold text-violet-700 underline" href={SUPPORT_WHATSAPP_URL}><MessageCircle size={14} aria-hidden /> WhatsApp {SUPPORT_WHATSAPP_DISPLAY}</a> · {SUPPORT_EMAIL}</p>
      </motion.section>
      <p className="mt-6 text-center text-sm text-slate-500">Estimates only; confirm requirements and placement rules on the official KUCCPS portal.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- unlocked */
function Unlocked({ creds }: { creds: { reportId: string; token: string } }) {
  const nav = useNavigate();
  const [q, setQ] = useState<ResultsQuery>({ page: 1, pageSize: 25, sort: 'cutoff', order: 'desc' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState<{ summary: Summary; results: Page } | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mailMsg, setMailMsg] = useState('');
  const [mailBusy, setMailBusy] = useState(false);

  const load = useCallback(async (query: ResultsQuery) => {
    setLoading(true); setErr('');
    try { setData(await api.results(creds.reportId, creds.token, query)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load results.'); }
    finally { setLoading(false); }
  }, [creds.reportId, creds.token]);
  useEffect(() => { void load(q); }, [q, load]);
  useEffect(() => { api.choices(creds.reportId, creds.token).then(setChoices).catch(() => undefined); }, [creds.reportId, creds.token]);
  useEffect(() => { const t = setTimeout(() => setQ((p) => ({ ...p, q: search || undefined, page: 1 })), 350); return () => clearTimeout(t); }, [search]);

  async function download() {
    setPdfBusy(true); setErr('');
    try {
      const blob = await api.pdf(creds.reportId, creds.token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'CYMOR-KCSE-Degree-Report.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr((e as Error).message); } finally { setPdfBusy(false); }
  }
  async function email() {
    setMailBusy(true); setMailMsg('');
    try {
      const r = await api.emailReport(creds.reportId, creds.token);
      setMailMsg(r.result === 'sent' ? 'Sent! Check your inbox (and spam folder).' : r.result === 'skipped' ? 'Email sending is not available right now. Please download the PDF.' : 'We could not send the email. Please download the PDF or contact support.');
    } catch (e) { setMailMsg((e as Error).message); } finally { setMailBusy(false); }
  }

  const s = data?.summary;
  const r = data?.results;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} aria-hidden /> Unlocked</span>
          <h1 className="mt-2 font-display text-4xl font-extrabold text-ink">Your results</h1></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={download} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />} Download PDF report</button>
          <button className="btn btn-ghost" onClick={email} disabled={mailBusy}>{mailBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail size={18} aria-hidden />} Email me the report</button>
          <button className="btn btn-ghost" onClick={() => { session.clear(); nav('/check'); }}>New check</button>
        </div>
      </div>
      {mailMsg && <p role="status" className="mt-3 rounded-lg bg-violet-50 p-3 text-violet-900">{mailMsg}</p>}
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{err}</p>}

      {s && (
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[['Qualifying options', String(s.qualifyingOptions)], ['Aggregate points', `${s.aggregatePoints} / 84`], ['Estimated mean grade', s.estimatedMeanGrade ?? '-'], ['Shared-cutoff options', String(s.sharedCutoffOptions)]].map(([k, v], i) => (
            <motion.div key={k} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }} className="card p-4"><div className="text-sm text-slate-500">{k}</div><div className="font-display text-3xl font-extrabold text-ink">{v}</div></motion.div>
          ))}
        </div>
      )}

      {choices && (
        <section className="mt-8" aria-labelledby="ch">
          <h2 id="ch" className="text-xl font-bold text-ink">Your recommended application choices</h2>
          <p className="text-sm text-slate-600">1A–1C are the same programme at three universities; 2–4 are other programmes.{choices.mode === 'preferences' ? ' Your preferred courses are placed first.' : ''}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {choices.rows.map((row, i) => (
              <motion.div key={row.choice} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }} whileHover={{ y: -4 }} className="card flex items-start gap-3 p-4">
                <span className={`rounded-lg px-3 py-2 font-extrabold text-white ${row.choice.startsWith('1') ? 'bg-brand' : 'bg-navy'}`}>{row.choice}</span>
                <div>{row.option ? (<><div className="font-semibold text-ink">{title(row.option.programmeName)}</div><div className="text-slate-600">{title(row.option.institutionName)}</div><div className="text-xs text-slate-500">Code {row.option.programmeCode} · cutoff {row.option.cutoff} ({row.option.cutoffYear})</div></>) : <div className="text-slate-500">No qualifying option available</div>}</div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="all">
        <h2 id="all" className="text-xl font-bold text-ink">All qualifying programmes</h2>
        <p className="text-sm text-slate-600">Listed from the highest cutoff to the lowest by default.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="relative flex-1 min-w-[220px]"><span className="sr-only">Search programmes or universities</span><Search size={16} className="absolute left-3 top-3.5 text-slate-400" aria-hidden /><input className="input pl-9" placeholder="Search programme or university" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label><span className="sr-only">Sort</span><select className="input" value={`${q.sort}:${q.order}`} onChange={(e) => { const [sort, order] = e.target.value.split(':'); setQ((p) => ({ ...p, sort: sort as string, order: order as 'asc' | 'desc', page: 1 })); }}>
            <option value="cutoff:desc">Cutoff: high to low</option><option value="cutoff:asc">Cutoff: low to high</option><option value="margin:desc">Margin: largest</option><option value="programme:asc">Programme A–Z</option><option value="institution:asc">University A–Z</option></select></label>
          <label><span className="sr-only">Filter by competitiveness</span><select className="input" value={q.competitiveness ?? ''} onChange={(e) => setQ((p) => ({ ...p, competitiveness: e.target.value || undefined, page: 1 }))}>
            <option value="">All levels</option><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="competitive">Competitive</option></select></label>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Info size={16} className="mt-0.5 shrink-0" aria-hidden /> A “shared minimum” cutoff means the same value is printed for many universities in the source document, so it is a generic floor rather than a university-specific cutoff.</div>

        <div className="card mt-3 overflow-x-auto" aria-busy={loading}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Qualifying programmes</caption>
            <thead className="bg-navy text-white"><tr><th className="p-3">Programme and university</th><th className="p-3">Code</th><th className="p-3 text-right">Your score</th><th className="p-3 text-right">Cutoff (year)</th><th className="p-3 text-right">Margin</th></tr></thead>
            <tbody>
              {r?.items.map((o: PublicOption) => { const l = level(o.margin); return (
                <tr key={o.programmeCode} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                  <td className="p-3"><div className="font-semibold text-ink">{title(o.programmeName)}</div><div className="text-slate-600">{title(o.institutionName)}</div></td>
                  <td className="p-3 font-mono">{o.programmeCode}</td>
                  <td className="p-3 text-right font-bold">{o.scoreDisplay}</td>
                  <td className="p-3 text-right">{o.cutoff} <span className="text-slate-500">({o.cutoffYear})</span>{o.cutoffBasis === 'shared-minimum' && <div className="text-xs font-semibold text-amber-700">shared minimum*</div>}</td>
                  <td className="p-3 text-right"><div className="font-bold">+{o.marginDisplay}</div><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.c}`}>{l.t}</span></td>
                </tr>); })}
              {r && r.items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No programmes match.</td></tr>}
            </tbody>
          </table>
        </div>

        {r && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
            <button className="btn btn-ghost" disabled={q.page <= 1 || loading} onClick={() => setQ((p) => ({ ...p, page: p.page - 1 }))}>Previous</button>
            <span className="text-sm text-slate-600">Page {r.page} of {r.totalPages} · {r.total} options</span>
            <button className="btn btn-ghost" disabled={q.page >= r.totalPages || loading} onClick={() => setQ((p) => ({ ...p, page: p.page + 1 }))}>Next</button>
          </nav>
        )}
      </section>

      <div className="mt-10 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-center text-white">
        <p className="font-display text-xl font-extrabold">Legendary Smiley Cymor wishes you the very best in your future education.</p>
        <p className="mt-1 text-sm text-violet-100">Need help? WhatsApp {SUPPORT_WHATSAPP_DISPLAY} · {SUPPORT_EMAIL}</p>
      </div>
      <p className="mt-6 text-sm text-slate-500">Estimates only; confirm requirements and placement rules on the official KUCCPS portal.</p>
    </div>
  );
}
