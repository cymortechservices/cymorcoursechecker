import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, ClipboardList, Loader2, Plus, Sparkles, Star, Trash2, User } from 'lucide-react';
import { ApiError, SubjectInfo, api, session } from '../lib/api';
import { Details, GRADE_LIST, Prefs, detailsSchema, gradesSchema, preferencesSchema } from '../lib/schemas';
import { LogoMark } from '../components/Logo';
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
const MESSAGES = ['Reading your grades…', 'Matching cluster subjects…', 'Checking subject requirements…', 'Comparing with cutoffs at every university…', 'Building your six choices…'];

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

  const details = useForm<Details>({ resolver: zodResolver(detailsSchema), defaultValues: { name: '', reference: '' } });
  const prefs = useForm<Prefs>({ resolver: zodResolver(preferencesSchema), defaultValues: { prefs: [{ value: '' }] } });
  const pf = useFieldArray({ control: prefs.control, name: 'prefs' });

  useEffect(() => { api.subjects().then((s) => setSubjects(s.subjects)).catch((e: ApiError) => setLoadErr(e.message)); }, []);
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
  const preview = complete ? ['eng', 'kis', 'math'].reduce((s, k) => s + pts(filled.find((r) => r.kind === k)?.grade ?? ''), 0) + others.map((r) => pts(r.grade)).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) : null;

  const setRow = (id: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); };

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
    if (step === 2 && !(await prefs.trigger())) return;
    go(step + 1);
  }

  async function submit() {
    setBusy(true); setSubmitErr('');
    const started = Date.now();
    try {
      const d = details.getValues();
      const out = await api.run({
        candidate: { name: d.name || undefined, reference: d.reference || undefined },
        grades: filled.map((r) => ({ subject: r.subject, grade: r.grade })),
        preferences: prefs.getValues().prefs.map((p) => p.value.trim()).filter(Boolean),
        pageSize: 25,
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

  const variants = { enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 60 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -60 }) };

  return (
    <div className="relative min-h-[80vh] overflow-hidden bg-gradient-to-b from-navy via-[#12183a] to-slate-100 pb-16">
      <div className="grid-bg absolute inset-x-0 top-0 h-80 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 pt-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center text-white">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Check your courses</h1>
          <p className="mt-2 text-slate-300">Four quick steps. Nothing is saved until you press “Show my courses”.</p>
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
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.28, ease: 'easeOut' }}>
              {step === 0 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Your details <span className="text-base font-normal text-slate-500">(optional)</span></h2>
                    <p className="mt-1 text-slate-600">These only appear on your PDF report. You can leave both blank.</p></div>
                  <label className="block"><span className="font-medium text-ink">Name</span><input className="input mt-1" autoComplete="off" placeholder="e.g. Amina Wanjiru" {...details.register('name')} /></label>
                  {details.formState.errors.name && <p className="text-sm text-red-700">{details.formState.errors.name.message}</p>}
                  <label className="block"><span className="font-medium text-ink">Index number or reference</span><input className="input mt-1" autoComplete="off" placeholder="e.g. 12345678/2025" {...details.register('reference')} /></label>
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
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Programme preferences <span className="text-base font-normal text-slate-500">(optional)</span></h2>
                    <p className="mt-1 text-slate-600">List programmes you would like, in order (for example “Bachelor of Science in Nursing”). Your six suggested choices will favour them if you qualify. Leave blank to get suggestions from your results.</p></div>
                  <AnimatePresence initial={false}>
                    {pf.fields.map((f, i) => (
                      <motion.div key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="flex items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 font-bold text-violet-700">{i + 1}</span>
                        <input aria-label={`Preference ${i + 1}`} className="input" placeholder="Programme name" {...prefs.register(`prefs.${i}.value` as const)} />
                        <button type="button" aria-label="Remove preference" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => pf.remove(i)}><Trash2 size={18} aria-hidden /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button type="button" className="btn btn-ghost" disabled={pf.fields.length >= 6} onClick={() => pf.append({ value: '' })}><Plus size={18} aria-hidden /> Add preference</button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div><h2 className="font-display text-2xl font-extrabold text-ink">Review and check</h2>
                    <p className="mt-1 text-slate-600">Make sure everything looks right, then we will find your courses.</p></div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {filled.map((r, i) => (
                      <motion.li key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                        <span className="font-medium text-ink">{byCode.get(r.subject)?.name ?? r.subject}</span>
                        <span className={`rounded-lg px-2.5 py-0.5 text-sm font-bold ${gradeColor(r.grade)}`}>{r.grade}</span>
                      </motion.li>
                    ))}
                  </ul>
                  {preview !== null && <p className="rounded-xl bg-violet-50 p-3 text-violet-900">Aggregate preview: <strong>{preview}/84</strong> (English, Kiswahili, Mathematics and your best four others).</p>}
                  <p className="text-sm text-slate-500">Results are estimates based on a published formula and past cutoffs.</p>
                  {submitErr && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{submitErr}</p>}
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button type="button" className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => go(step - 1)}><ArrowLeft size={18} aria-hidden /> Back</button>
            {step < 3 ? (
              <button type="button" className="btn btn-primary" disabled={checking} onClick={next}>{checking ? <Loader2 className="animate-spin" size={18} aria-hidden /> : null} Next <ArrowRight size={18} aria-hidden /></button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>Show my courses <Sparkles size={18} aria-hidden /></button>
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
