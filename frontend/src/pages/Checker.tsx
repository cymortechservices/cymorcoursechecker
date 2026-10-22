import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, ClipboardList, Loader2, Lock, Plus, Sparkles, Star, Trash2, User, X } from 'lucide-react';
import { ApiError, SubjectInfo, api, session } from '../lib/api';
import { Details, GRADE_LIST, detailsSchema, gradesSchema } from '../lib/schemas';
import { SUPPORT_EMAIL } from '../lib/site';
import { LogoMark } from '../components/Logo';
import ErrorBoundary from '../components/ErrorBoundary';
import SubjectPicker from '../components/SubjectPicker';
import { FALLBACK_SUBJECTS } from '../lib/subjects.fallback';

type Kind = 'eng' | 'kis' | 'math' | 'other';
interface Row { id: number; kind: Kind; subject: string; grade: string }
const MATHS = ['MATA', 'MATB'];
const pts = (g: string) => { const i = GRADE_LIST.indexOf(g as (typeof GRADE_LIST)[number]); return i < 0 ? 0 : 12 - i; };
const START: Row[] = [
  { id: 1, kind: 'eng', subject: 'ENG', grade: '' },
  { id: 2, kind: 'kis', subject: 'KIS', grade: '' },
  { id: 3, kind: 'math', subject: 'MATA', grade: '' },
  { id: 4, kind: 'other', subject: '', grade: '' },
  { id: 5, kind: 'other', subject: '', grade: '' },
  { id: 6, kind: 'other', subject: '', grade: '' },
  { id: 7, kind: 'other', subject: '', grade: '' },
];
const STEPS = [
  { label: 'Details', icon: User },
  { label: 'Grades', icon: ClipboardList },
  { label: 'Preferences', icon: Star },
  { label: 'Review', icon: CheckCircle2 },
];
const gradeColor = (g: string) => (pts(g) >= 10 ? 'bg-emerald-500 text-white' : pts(g) >= 7 ? 'bg-violet-600 text-white' : pts(g) >= 4 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white');
/** Search words, not data: matched against programme names by the server (every word must appear in the programme name). */
const POPULAR = ['Medicine', 'Nursing', 'Pharmacy', 'Engineering', 'Computer Science', 'Law', 'Education', 'Commerce', 'Economics', 'Architecture', 'Agriculture', 'Actuarial', 'Journalism', 'Psychology'];
const MESSAGES = ['Reading your grades…', 'Matching cluster subjects…', 'Checking subject requirements…', 'Comparing with cutoffs at every university…', 'Preparing your results…'];

export default function Checker() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [subjects, setSubjects] = useState<SubjectInfo[]>(FALLBACK_SUBJECTS);
  const [loadErr, setLoadErr] = useState('');
  const [rows, setRows] = useState<Row[]>(START);
  const nextId = useRef(100);
  const [gradeErr, setGradeErr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState(0);
  const [submitErr, setSubmitErr] = useState('');

  const details = useForm<Details>({ resolver: zodResolver(detailsSchema), defaultValues: { email: '', name: '', reference: '' } });
  const [prefs, setPrefs] = useState<string[]>([]);
  const [prefText, setPrefText] = useState('');
  const [suggest, setSuggest] = useState<string[]>([]);

  useEffect(() => { api.subjects().then((s) => setSubjects(s.subjects)).catch((e: ApiError) => setLoadErr(e.message)); }, []);
  useEffect(() => {
    const q = prefText.trim();
    if (q.length < 2) { setSuggest([]); return undefined; }
    const t = window.setTimeout(() => { api.programmeNames(q).then(setSuggest).catch(() => setSuggest([])); }, 250);
    return () => window.clearTimeout(t);
  }, [prefText]);
  const addPref = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!v) return;
    setPrefs((p) => (p.length >= 10 || p.some((x) => x.toLowerCase() === v.toLowerCase()) ? p : [...p, v]));
    setPrefText(''); setSuggest([]);
  };
  useEffect(() => { if (!busy) return; const t = window.setInterval(() => setMsg((m) => (m + 1) % MESSAGES.length), 1400); return () => window.clearInterval(t); }, [busy]);

  const byCode = useMemo(() => new Map(subjects.map((s) => [s.code, s] as const)), [subjects]);
  const taken = new Set(rows.map((r) => r.subject).filter(Boolean));
  const otherChoices = subjects.filter((s) => s.code !== 'ENG' && s.code !== 'KIS' && !MATHS.includes(s.code));

  const filled = rows.filter((r) => r.subject && r.grade);
  const has = (k: Kind) => filled.some((r) => r.kind === k);
  const others = filled.filter((r) => r.kind === 'other');
  const checklist = [
    { ok: has('eng'), label: 'English' },
    { ok: has('kis'), label: 'Kiswahili' },
    { ok: has('math'), label: 'Mathematics' },
    { ok: others.length >= 4, label: `${Math.min(others.length, 4)}/4 other subjects` },
  ];
  const complete = checklist.every((c) => c.ok);
  // Aggregate: Mathematics + the better of English/Kiswahili + the best five of the remaining subjects
  // (the weaker language competes with the others for those five places).
  const preview = (() => {
    if (!complete) return null;
    const g = (k: Kind) => pts(filled.find((r) => r.kind === k)?.grade ?? '');
    const eng = g('eng'); const kis = g('kis');
    const rest = [...others.map((r) => pts(r.grade)), Math.min(eng, kis)].sort((a, b) => b - a).slice(0, 5);
    return g('math') + Math.max(eng, kis) + rest.reduce((a, b) => a + b, 0);
  })();

  const setRow = (id: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); window.scrollTo({ top: 0, behavior: 'auto' }); };

  async function validateGrades(): Promise<boolean> {
    const errs: string[] = [];
    if (rows.some((r) => r.subject && !r.grade)) errs.push('Choose a grade for every subject listed, or remove the row.');
    if (rows.some((r) => !r.subject && r.grade)) errs.push('Choose a subject for every row that has a grade.');
    const local = gradesSchema.safeParse(filled.map((r) => ({ subject: r.subject, grade: r.grade })));
    if (!local.success) errs.push(...local.error.issues.map((i) => i.message));
    if (errs.length === 0) {
      setChecking(true);
      try { const v = await api.validate(filled.map((r) => ({ subject: r.subject, grade: r.grade }))); if (!v.valid) errs.push(...v.errors); }
      catch (e) { errs.push((e as Error).message); }
      setChecking(false);
    }
    setGradeErr([...new Set(errs)]);
    return errs.length === 0;
  }

  async function next() {
    if (step === 0 && !(await details.trigger())) return;
    if (step === 1 && !(await validateGrades())) return;
    go(step + 1);
  }

  async function submit() {
    setBusy(true); setSubmitErr('');
    const started = Date.now();
    try {
      const d = details.getValues();
      const out = await api.run({
        email: d.email,
        candidate: { name: d.name || undefined, reference: d.reference || undefined },
        grades: filled.map((r) => ({ subject: r.subject, grade: r.grade })),
        preferences: prefs,
      });
      const wait = Math.max(0, 1800 - (Date.now() - started)); // let the progress animation be seen
      await new Promise((r) => setTimeout(r, reduce ? 0 : wait));
      session.save({ reportId: out.reportId, token: out.accessToken });
      nav('/results', { state: { first: out } });
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }


  return (
    <div className="relative min-h-[80vh] overflow-hidden bg-gradient-to-b from-navy via-[#12183a] to-slate-100 pb-16">
      <div className="grid-bg absolute inset-x-0 top-0 h-80 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 pt-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center text-white">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Check your courses</h1>
          <p className="mt-2 text-slate-300">Four quick steps. See how many courses you qualify for free, then unlock the full list and PDF report.</p>
        </motion.div>

        {/* Stepper */}
        <ol className="relative mt-8 flex items-start justify-between" aria-label="Progress">
          <div className="absolute left-[12%] right-[12%] top-5 h-1 rounded bg-white/15" aria-hidden>
            <motion.div className="h-full rounded bg-gradient-to-r from-cyan-300 to-violet-400" animate={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          {STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'now' : 'todo';
            return (
              <li key={s.label} aria-current={i === step ? 'step' : undefined} className="relative z-10 flex w-1/4 flex-col items-center">
                <motion.div animate={{ scale: state === 'now' ? 1.15 : 1 }} className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${state === 'done' ? 'border-cyan-300 bg-cyan-300 text-navy' : state === 'now' ? 'border-violet-400 bg-violet-600 text-white shadow-lg shadow-violet-600/40' : 'border-white/25 bg-navy text-slate-400'}`}>
                  {state === 'done' ? <Check size={18} aria-hidden /> : <s.icon size={18} aria-hidden />}
                </motion.div>
                <span className={`mt-2 text-xs font-medium sm:text-sm ${state === 'todo' ? 'text-slate-400' : 'text-white'}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>

        {loadErr && <p role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">Could not reach the server just now ({loadErr}). You can keep filling in your grades; we will try again when you press Next.</p>}

        <div className="card relative mt-6 overflow-hidden p-6 shadow-xl sm:p-8">
          {/* No exit animation: waiting for an exit (AnimatePresence mode="wait") could leave the next step invisible. */}
          <ErrorBoundary key={step}>
            <section key={step} className={dir > 0 ? 'step-in-right' : 'step-in-left'}>
              {step === 0 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Your details</h2>
                    <p className="mt-1 text-slate-600">We email your PDF report to the address below so you can keep it for later. We never share it.</p></div>
                  <label className="block"><span className="font-medium text-ink">Email address <span className="text-rose-600">*</span></span><input type="email" inputMode="email" className="input mt-1" autoComplete="email" placeholder="you@example.com" aria-required="true" {...details.register('email')} /></label>
                  {details.formState.errors.email && <p role="alert" className="text-sm text-red-700">{details.formState.errors.email.message}</p>}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block"><span className="font-medium text-ink">Name <span className="text-sm font-normal text-slate-500">(optional)</span></span><input className="input mt-1" autoComplete="name" placeholder="e.g. Amina Wanjiru" {...details.register('name')} /></label>
                    <label className="block"><span className="font-medium text-ink">Index number <span className="text-sm font-normal text-slate-500">(optional)</span></span><input className="input mt-1" autoComplete="off" placeholder="e.g. 12345678/2025" {...details.register('reference')} /></label>
                  </div>
                  {details.formState.errors.name && <p className="text-sm text-red-700">{details.formState.errors.name.message}</p>}
                  {details.formState.errors.reference && <p className="text-sm text-red-700">{details.formState.errors.reference.message}</p>}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Your KCSE grades</h2>
                    <p className="mt-1 text-slate-600">Tap a grade for each subject. Use at least 7 subjects (maximum 12).</p></div>

                  <div className="flex flex-wrap gap-2" aria-label="Requirements checklist">
                    {checklist.map((c) => (
                      <motion.span key={c.label} layout animate={{ scale: c.ok ? [1, 1.12, 1] : 1 }} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${c.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {c.ok ? <CheckCircle2 size={14} aria-hidden /> : <Circle size={14} aria-hidden />}{c.label}
                      </motion.span>
                    ))}
                    <AnimatePresence>{preview !== null && (
                      <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800"><Sparkles size={14} aria-hidden /> Aggregate preview: {preview}/84</motion.span>
                    )}</AnimatePresence>
                  </div>

                  <LayoutGroup>
                    <ul className="space-y-3">
                      <AnimatePresence initial={false}>
                        {rows.map((r, idx) => (
                          <motion.li key={r.id} layout initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: -40, height: 0, marginTop: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26, delay: reduce ? 0 : Math.min(idx, 6) * 0.03 }} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {r.kind === 'other' ? (
                                <SubjectPicker label={`Subject ${idx + 1}`} value={r.subject} options={otherChoices.filter((s) => !taken.has(s.code) || s.code === r.subject)} onChange={(code) => setRow(r.id, { subject: code })} />
                              ) : r.kind === 'math' ? (
                                <div className="flex flex-1 items-center gap-2" role="group" aria-label="Mathematics paper">
                                  <span className="font-semibold text-ink">Mathematics</span>
                                  {MATHS.map((m) => (
                                    <button key={m} type="button" onClick={() => setRow(r.id, { subject: m })} aria-pressed={r.subject === m} className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${r.subject === m ? 'bg-ink text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}`}>{m === 'MATA' ? 'Alt A' : 'Alt B'}</button>
                                  ))}
                                </div>
                              ) : (
                                <span className="flex-1 font-semibold text-ink">{byCode.get(r.subject)?.name ?? (r.kind === 'eng' ? 'English' : 'Kiswahili')}</span>
                              )}
                              {r.grade && <motion.span key={r.grade} initial={{ scale: 0.5 }} animate={{ scale: 1 }} className={`rounded-lg px-2.5 py-1 text-sm font-bold ${gradeColor(r.grade)}`}>{r.grade} · {pts(r.grade)} pts</motion.span>}
                              {r.kind === 'other' && (
                                <button type="button" aria-label="Remove subject" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={rows.length <= 7} onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}><Trash2 size={18} aria-hidden /></button>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Grade for ${byCode.get(r.subject)?.name ?? `subject ${idx + 1}`}`}>
                              {GRADE_LIST.map((g) => (
                                <motion.button key={g} type="button" role="radio" aria-checked={r.grade === g} whileTap={{ scale: 0.9 }} whileHover={{ y: -2 }} onClick={() => setRow(r.id, { grade: g })}
                                  className={`h-9 min-w-[2.6rem] rounded-lg border text-sm font-bold transition-colors ${r.grade === g ? 'border-transparent ' + gradeColor(g) + ' shadow-md' : 'border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:text-violet-700'}`}>{g}</motion.button>
                              ))}
                            </div>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </LayoutGroup>

                  <button type="button" className="btn btn-ghost" disabled={rows.length >= 12} onClick={() => setRows((x) => [...x, { id: nextId.current++, kind: 'other', subject: '', grade: '' }])}><Plus size={18} aria-hidden /> Add subject</button>

                  <AnimatePresence>{gradeErr.length > 0 && (
                    <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                      <div className="flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden /><ul className="list-disc pl-4">{gradeErr.map((e) => <li key={e}>{e}</li>)}</ul></div>
                    </motion.div>
                  )}</AnimatePresence>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Courses you would love <span className="text-base font-normal text-slate-500">(optional)</span></h2>
                    <p className="mt-1 text-slate-600">Add the courses you prefer. If you qualify for them, they are placed first in your recommended choices. You can skip this step.</p></div>
                  <div className="relative">
                    <label className="block"><span className="sr-only">Preferred course</span>
                      <input className="input" value={prefText} maxLength={120} placeholder="Type a course, e.g. Nursing, Computer Science, Law" onChange={(e) => setPrefText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPref(prefText); } }} />
                    </label>
                    <AnimatePresence>
                      {suggest.length > 0 && (
                        <motion.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                          {suggest.map((n) => <li key={n}><button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-violet-50" onClick={() => addPref(n)}>{n}</button></li>)}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                  <button type="button" className="btn btn-ghost" disabled={!prefText.trim() || prefs.length >= 10} onClick={() => addPref(prefText)}><Plus size={18} aria-hidden /> Add course</button>
                  {prefs.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="Your preferred courses">
                      <AnimatePresence initial={false}>
                        {prefs.map((p, i) => (
                          <li key={p} className="inline-flex items-center gap-2 rounded-full bg-violet-100 py-1.5 pl-3 pr-1.5 text-sm font-medium text-violet-900">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{i + 1}</span>{p}
                            <button type="button" aria-label={`Remove ${p}`} className="rounded-full p-1 text-violet-700 hover:bg-violet-200" onClick={() => setPrefs((x) => x.filter((y) => y !== p))}><X size={14} aria-hidden /></button>
                          </li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-ink">Popular choices: tap to add</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {POPULAR.filter((c) => !prefs.some((p) => p.toLowerCase() === c.toLowerCase())).map((c) => (
                        <motion.button key={c} type="button" whileTap={{ scale: 0.94 }} whileHover={{ y: -2 }} disabled={prefs.length >= 10} onClick={() => addPref(c)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40">+ {c}</motion.button>
                      ))}
                    </div>
                  </div>
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Up to 10 courses. The first ones you add are favoured first. Short words work best (for example “Nursing”). Nothing here is required: press Next to skip.</p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Review and check</h2>
                    <p className="mt-1 text-slate-600">Make sure everything looks right, then we will find your courses.</p></div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {filled.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                        <span className="font-medium text-ink">{byCode.get(r.subject)?.name ?? r.subject}</span>
                        <span className={`rounded-lg px-2.5 py-0.5 text-sm font-bold ${gradeColor(r.grade)}`}>{r.grade}</span>
                      </li>
                    ))}
                  </ul>
                  {preview !== null && <p className="rounded-xl bg-violet-50 p-3 text-violet-900">Aggregate preview: <strong>{preview}/84</strong> (Mathematics, the better of English and Kiswahili, and your best five other subjects).</p>}
                  {prefs.length > 0 && <p className="text-sm text-slate-600">Preferred courses: <strong>{prefs.join(', ')}</strong></p>}
                  <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><Lock size={16} className="mt-0.5 shrink-0 text-violet-600" aria-hidden /> You will see how many courses you qualify for straight away. A one-time payment unlocks the full list, your recommended choices and the PDF report, which is also emailed to you. Questions? {SUPPORT_EMAIL}</p>
                  <p className="text-sm text-slate-500">Results are estimates based on a published formula and past cutoffs.</p>
                  {submitErr && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{submitErr}</p>}
                </div>
              )}
            </section>
          </ErrorBoundary>

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button type="button" className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => go(step - 1)}><ArrowLeft size={18} aria-hidden /> Back</button>
            {step < 3 ? (
              <button type="button" className="btn btn-primary" disabled={checking} onClick={next}>{checking ? <Loader2 className="animate-spin" size={18} aria-hidden /> : null} Next <ArrowRight size={18} aria-hidden /></button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>See my results <Sparkles size={18} aria-hidden /></button>
            )}
          </div>
        </div>
      </div>

      {/* Processing overlay */}
      <AnimatePresence>
        {busy && !submitErr && (
          <motion.div role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy/95 text-white backdrop-blur">
            <div className="relative flex h-40 w-40 items-center justify-center">
              <span className="absolute h-full w-full animate-pulseRing rounded-full border-2 border-cyan-300/60" aria-hidden />
              <span className="absolute h-full w-full animate-pulseRing rounded-full border-2 border-violet-400/60 [animation-delay:-1s]" aria-hidden />
              <LogoMark size={84} animated />
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={msg} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-8 text-lg font-semibold">{MESSAGES[msg]}</motion.p>
            </AnimatePresence>
            <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-gradient-to-r from-cyan-300 to-violet-400" initial={{ width: '5%' }} animate={{ width: '92%' }} transition={{ duration: 6, ease: 'easeOut' }} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
