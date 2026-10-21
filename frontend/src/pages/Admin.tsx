import { FormEvent, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Banknote, Download, FileText, Loader2, LogOut, Mail, Percent, Plus, RefreshCw, Ticket, TrendingUp } from 'lucide-react';
import { ApiError, Coupon, OrderRow, Stats, adminApi, adminSession } from '../lib/api';
import { kes } from '../lib/site';

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800', unpaid: 'bg-slate-100 text-slate-600', failed: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-200 text-slate-700',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }) : '-');
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

export default function Admin() {
  const [authed, setAuthed] = useState(() => Boolean(adminSession.get()));
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => { adminSession.clear(); setAuthed(false); }} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await adminApi.login(email.trim(), password); adminSession.set(r.token); onDone(); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <form onSubmit={submit} className="card space-y-4 p-8 shadow-xl">
        <h1 className="font-display text-2xl font-extrabold text-ink">Admin sign in</h1>
        <label className="block"><span className="font-medium text-ink">Email</span><input className="input mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block"><span className="font-medium text-ink">Password</span><input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden />} Sign in</button>
      </form>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<{ total: number; items: OrderRow[] } | null>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [skip, setSkip] = useState(0);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 25;

  const guard = useCallback((e: unknown) => { if (e instanceof ApiError && e.status === 401) onLogout(); else setErr(errMsg(e)); }, [onLogout]);
  const reload = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [s, o, c] = await Promise.all([adminApi.stats(), adminApi.orders({ status: status || undefined, q: q || undefined, skip, limit }), adminApi.coupons()]);
      setStats(s); setOrders(o); setCoupons(c);
    } catch (e) { guard(e); } finally { setLoading(false); }
  }, [status, q, skip, guard]);
  useEffect(() => { const t = setTimeout(() => void reload(), 250); return () => clearTimeout(t); }, [reload]);

  async function exportCsv() {
    try {
      const blob = await adminApi.csv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { guard(e); }
  }
  async function resend(id: string) {
    try { const r = await adminApi.resend(id); setErr(''); alert(`Email ${r.result}`); void reload(); } catch (e) { guard(e); }
  }

  const max = Math.max(1, ...(stats?.daily.map((d) => d.reports) ?? [1]));
  const cards = stats ? [
    { icon: FileText, label: 'Reports generated', value: String(stats.reportsGenerated), sub: `${stats.today.reports} today` },
    { icon: Banknote, label: 'Money earned', value: kes(stats.revenue), sub: `${kes(stats.today.revenue)} today · ${kes(stats.last7Days.revenue)} last 7 days` },
    { icon: TrendingUp, label: 'Paid reports', value: String(stats.paidCount), sub: `${(stats.conversionRate * 100).toFixed(1)}% conversion · ${stats.pendingCount} pending` },
    { icon: Ticket, label: 'Free unlocks (100% coupons)', value: String(stats.freeUnlocks), sub: `${kes(stats.last30Days.revenue)} last 30 days` },
  ] : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold text-ink">Business dashboard</h1>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => void reload()} disabled={loading}>{loading ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <RefreshCw size={18} aria-hidden />} Refresh</button>
          <button className="btn btn-ghost" onClick={exportCsv}><Download size={18} aria-hidden /> CSV</button>
          <button className="btn btn-ghost" onClick={onLogout}><LogOut size={18} aria-hidden /> Sign out</button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{err}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="card p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500"><c.icon size={16} aria-hidden /> {c.label}</div>
            <div className="mt-1 font-display text-3xl font-extrabold text-ink">{c.value}</div>
            <div className="mt-1 text-xs text-slate-500">{c.sub}</div>
          </motion.div>
        ))}
      </div>

      {stats && (
        <section className="card mt-6 p-5" aria-label="Last 14 days">
          <h2 className="font-bold text-ink">Last 14 days</h2>
          <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label="Reports per day, with paid reports highlighted">
            {stats.daily.map((d) => (
              <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${d.date}: ${d.reports} reports, ${d.paid} paid, ${kes(d.revenue)}`}>
                <div className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-violet-100" style={{ height: `${Math.max(4, (d.reports / max) * 100)}%` }}>
                  <div className="bg-violet-600" style={{ height: d.reports ? `${(d.paid / d.reports) * 100}%` : 0 }} />
                </div>
                <span className="mt-1 text-[10px] text-slate-500">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500"><span className="inline-block h-2 w-2 rounded bg-violet-600" /> paid <span className="ml-3 inline-block h-2 w-2 rounded bg-violet-100 ring-1 ring-violet-200" /> generated (days in Nairobi time)</p>
        </section>
      )}

      <CouponPanel coupons={coupons} top={stats?.topCoupons ?? []} onChange={reload} guard={guard} />

      <section className="mt-8" aria-labelledby="ord">
        <h2 id="ord" className="text-xl font-bold text-ink">Reports and payments</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Search email, name, receipt, ID" value={q} onChange={(e) => { setQ(e.target.value); setSkip(0); }} aria-label="Search orders" />
          <select className="input max-w-[11rem]" value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }} aria-label="Filter by status">
            <option value="">All statuses</option>{['paid', 'pending', 'unpaid', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy text-white"><tr>{['When', 'Email', 'Options', 'Status', 'Amount', 'Coupon', 'M-Pesa', 'Email sent', ''].map((h) => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead>
            <tbody>
              {orders?.items.map((o) => (
                <tr key={o.reportId} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                  <td className="whitespace-nowrap p-3">{fmt(o.createdAt)}</td>
                  <td className="p-3"><div className="font-medium text-ink">{o.email}</div>{o.candidateName && <div className="text-xs text-slate-500">{o.candidateName}</div>}</td>
                  <td className="p-3">{o.qualifyingCount}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[o.status] ?? ''}`}>{o.status}</span></td>
                  <td className="whitespace-nowrap p-3 font-semibold">{o.status === 'paid' ? kes(o.amountDue) : <span className="text-slate-400">{kes(o.amountDue)}</span>}</td>
                  <td className="p-3">{o.couponCode ? `${o.couponCode} (${o.discountPercent}%)` : '-'}</td>
                  <td className="p-3 font-mono text-xs">{o.mpesaReceipt ?? '-'}{o.phone && <div className="text-slate-500">{o.phone}</div>}</td>
                  <td className="p-3">{o.emailStatus}</td>
                  <td className="p-3">{o.status === 'paid' && <button className="rounded-lg p-2 text-violet-700 hover:bg-violet-50" title="Resend report email" aria-label={`Resend report to ${o.email}`} onClick={() => void resend(o.reportId)}><Mail size={16} aria-hidden /></button>}</td>
                </tr>
              ))}
              {orders && orders.items.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">No reports yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {orders && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
            <button className="btn btn-ghost" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - limit))}>Previous</button>
            <span className="text-sm text-slate-600">{orders.total === 0 ? 0 : skip + 1}–{Math.min(skip + limit, orders.total)} of {orders.total}</span>
            <button className="btn btn-ghost" disabled={skip + limit >= orders.total} onClick={() => setSkip(skip + limit)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}

function CouponPanel({ coupons, top, onChange, guard }: { coupons: Coupon[] | null; top: Array<{ code: string; uses: number }>; onChange: () => Promise<void>; guard: (e: unknown) => void }) {
  const [code, setCode] = useState('');
  const [pct, setPct] = useState('10');
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      await adminApi.createCoupon({ code: code.trim(), percentOff: Number(pct), maxUses: maxUses ? Number(maxUses) : undefined, expiresAt: expires ? new Date(`${expires}T23:59:59+03:00`).toISOString() : undefined, note: note.trim() || undefined });
      setCode(''); setMaxUses(''); setExpires(''); setNote(''); setMsg('Coupon created.'); await onChange();
    } catch (x) { setMsg(errMsg(x)); if (x instanceof ApiError && x.status === 401) guard(x); } finally { setBusy(false); }
  }
  async function toggle(c: Coupon) { try { await adminApi.setCouponActive(c.code, !c.active); await onChange(); } catch (e) { guard(e); } }
  const uses = new Map(top.map((t) => [t.code, t.uses]));
  return (
    <section className="mt-8" aria-labelledby="cp">
      <h2 id="cp" className="flex items-center gap-2 text-xl font-bold text-ink"><Percent size={20} aria-hidden /> Coupon codes</h2>
      <form onSubmit={create} className="card mt-3 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block lg:col-span-1"><span className="text-sm font-medium text-ink">Code</span><input className="input mt-1 uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAVE20" maxLength={20} required /></label>
        <label className="block"><span className="text-sm font-medium text-ink">Discount %</span><input className="input mt-1" type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} required /></label>
        <label className="block"><span className="text-sm font-medium text-ink">Max uses</span><input className="input mt-1" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" /></label>
        <label className="block"><span className="text-sm font-medium text-ink">Expires</span><input className="input mt-1" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <label className="block"><span className="text-sm font-medium text-ink">Note</span><input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Optional" /></label>
        <div className="flex items-end"><button className="btn btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Plus size={18} aria-hidden />} Create</button></div>
        {msg && <p role="status" className="text-sm text-slate-700 sm:col-span-2 lg:col-span-6">{msg}</p>}
      </form>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white"><tr>{['Code', 'Discount', 'Used', 'Limit', 'Expires', 'Note', 'Status'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>
            {coupons?.map((c) => (
              <tr key={c.code} className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
                <td className="p-3 font-mono font-bold">{c.code}</td><td className="p-3">{c.percentOff}%</td><td className="p-3">{c.usedCount}{uses.has(c.code) ? '' : ''}</td>
                <td className="p-3">{c.maxUses ?? 'Unlimited'}</td><td className="p-3">{c.expiresAt ? fmt(c.expiresAt) : 'Never'}</td><td className="p-3 text-slate-600">{c.note ?? ''}</td>
                <td className="p-3"><button className={`rounded-full px-3 py-1 text-xs font-semibold ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`} onClick={() => void toggle(c)} aria-pressed={c.active}>{c.active ? 'Active: click to disable' : 'Disabled: click to enable'}</button></td>
              </tr>
            ))}
            {coupons && coupons.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No coupons yet. Create one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
