import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Download, Info, Loader2, Search } from 'lucide-react';
import { ApiError, Choices, Page, PublicOption, ResultsQuery, RunResult, Summary, api, session } from '../lib/api';

const title = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|And|In|The|For)\b/g, (m) => m.toLowerCase()) : s);
const level = (m: number) => (m >= 3 ? { t: 'Safe', c: 'bg-emerald-100 text-emerald-800' } : m >= 1 ? { t: 'Balanced', c: 'bg-amber-100 text-amber-800' } : { t: 'Competitive', c: 'bg-indigo-100 text-indigo-800' });

export default function Results() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { first?: RunResult } };
  const creds = session.load();
  const [q, setQ] = useState<ResultsQuery>({ page: 1, pageSize: 25, sort: 'cutoff', order: 'desc' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState<{ summary: Summary; results: Page } | null>(loc.state?.first ? { summary: loc.state.first.summary, results: loc.state.first.results } : null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async (query: ResultsQuery) => {
    if (!creds) return;
    setLoading(true); setErr('');
    try { setData(await api.results(creds.reportId, creds.token, query)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load results.'); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds?.reportId, creds?.token]);

  useEffect(() => { if (!creds) return; if (!(q.page === 1 && q.sort === 'cutoff' && q.order === 'desc' && !q.q && !q.competitiveness && loc.state?.first)) void load(q); }, [q, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (creds) api.choices(creds.reportId, creds.token).then(setChoices).catch(() => undefined); }, [creds?.reportId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setQ((p) => ({ ...p, q: search || undefined, page: 1 })), 350); return () => clearTimeout(t); }, [search]);

  if (!creds) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold text-ink">No results to show</h1>
      <p className="mt-2 text-slate-600">Results are kept only for this browser tab. Start a new check to see your courses.</p>
      <Link className="btn btn-primary mt-6" to="/check">Start a check</Link></div>
  );

  async function download() {
    if (!creds) return;
    setPdfBusy(true); setErr('');
    try {
      const blob = await api.pdf(creds.reportId, creds.token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `CYMOR-KCSE-Degree-Report.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr((e as Error).message); } finally { setPdfBusy(false); }
  }

  const s = data?.summary;
  const r = data?.results;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-ink">Your results</h1>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={download} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />} Download PDF report</button>
          <button className="btn btn-ghost" onClick={() => { session.clear(); nav('/check'); }}>New check</button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{err}</p>}

      {s && (
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[['Qualifying options', String(s.qualifyingOptions)], ['Aggregate points', `${s.aggregatePoints} / 84`], ['Estimated mean grade', s.estimatedMeanGrade ?? '-'], ['Shared-cutoff options', String(s.sharedCutoffOptions)]].map(([k, v]) => (
            <div key={k} className="card p-4"><div className="text-sm text-slate-500">{k}</div><div className="text-2xl font-extrabold text-ink">{v}</div></div>
          ))}
        </div>
      )}

      {choices && (
        <section className="mt-8" aria-labelledby="ch">
          <h2 id="ch" className="text-xl font-bold text-ink">Your recommended application choices</h2>
          <p className="text-sm text-slate-600">1A–1C are the same programme at three universities; 2–4 are other programmes.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {choices.rows.map((row) => (
              <div key={row.choice} className="card flex items-start gap-3 p-4">
                <span className={`rounded-lg px-3 py-2 font-extrabold text-white ${row.choice.startsWith('1') ? 'bg-brand' : 'bg-navy'}`}>{row.choice}</span>
                <div>{row.option ? (<><div className="font-semibold text-ink">{title(row.option.programmeName)}</div><div className="text-slate-600">{title(row.option.institutionName)}</div><div className="text-xs text-slate-500">Code {row.option.programmeCode} · cutoff {row.option.cutoff} ({row.option.cutoffYear})</div></>) : <div className="text-slate-500">No qualifying option available</div>}</div>
              </div>
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
      <p className="mt-8 text-sm text-slate-500">Estimates only; confirm requirements and placement rules on the official KUCCPS portal.</p>
    </div>
  );
}
