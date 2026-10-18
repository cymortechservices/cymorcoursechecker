import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { ApiError, SubjectInfo, api, session } from '../lib/api';
import { Details, GRADE_LIST, Prefs, detailsSchema, gradesSchema, preferencesSchema } from '../lib/schemas';

interface Row { subject: string; grade: string }
const START: Row[] = [{ subject: 'ENG', grade: '' }, { subject: 'KIS', grade: '' }, { subject: 'MATA', grade: '' }];
const STEPS = ['Your details', 'Your grades', 'Preferences', 'Review'];

export default function Checker() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [rows, setRows] = useState<Row[]>(START);
  const [gradeErr, setGradeErr] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  const details = useForm<Details>({ resolver: zodResolver(detailsSchema), defaultValues: { name: '', reference: '' } });
  const prefs = useForm<Prefs>({ resolver: zodResolver(preferencesSchema), defaultValues: { prefs: [{ value: '' }] } });
  const pf = useFieldArray({ control: prefs.control, name: 'prefs' });

  useEffect(() => { api.subjects().then((s) => setSubjects(s.subjects)).catch((e: ApiError) => setLoadErr(e.message)); }, []);
  const byCode = useMemo(() => new Map(subjects.map((s) => [s.code, s] as const)), [subjects]);
  const taken = new Set(rows.map((r) => r.subject));

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function validateGrades(): Promise<boolean> {
    const filled = rows.filter((r) => r.subject && r.grade);
    const local = gradesSchema.safeParse(filled);
    const errs: string[] = [];
    if (rows.some((r) => r.subject && !r.grade)) errs.push('Choose a grade for every subject listed (or remove the row).');
    if (!local.success) errs.push(...local.error.issues.map((i) => i.message));
    if (errs.length === 0) {
      try {
        const v = await api.validate(filled);
        if (!v.valid) errs.push(...v.errors);
      } catch (e) { errs.push((e as Error).message); }
    }
    setGradeErr(errs);
    return errs.length === 0;
  }

  async function next() {
    if (step === 0 && !(await details.trigger())) return;
    if (step === 1 && !(await validateGrades())) return;
    if (step === 2 && !(await prefs.trigger())) return;
    setStep((s) => s + 1);
  }

  async function submit() {
    setBusy(true); setSubmitErr('');
    try {
      const d = details.getValues();
      const out = await api.run({
        candidate: { name: d.name || undefined, reference: d.reference || undefined },
        grades: rows.filter((r) => r.subject && r.grade),
        preferences: prefs.getValues().prefs.map((p) => p.value.trim()).filter(Boolean),
        pageSize: 25,
      });
      session.save({ reportId: out.reportId, token: out.accessToken });
      nav('/results', { state: { first: out } });
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ol className="flex gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex-1 rounded-lg px-2 py-2 text-center font-medium ${i === step ? 'bg-brand text-white' : i < step ? 'bg-brand-soft text-brand' : 'bg-white text-slate-500 border border-slate-200'}`}>{i + 1}. {s}</li>
        ))}
      </ol>

      {loadErr && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{loadErr}</p>}

      <AnimatePresence mode="wait">
        <motion.section key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="card mt-5 p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold text-ink">Your details <span className="text-base font-normal text-slate-500">(optional)</span></h1>
              <p className="text-slate-600">These only appear on your PDF report. You can leave both blank.</p>
              <label className="block"><span className="font-medium">Name</span><input className="input mt-1" autoComplete="off" {...details.register('name')} /></label>
              {details.formState.errors.name && <p className="text-sm text-red-700">{details.formState.errors.name.message}</p>}
              <label className="block"><span className="font-medium">Index number or reference</span><input className="input mt-1" autoComplete="off" {...details.register('reference')} /></label>
              {details.formState.errors.reference && <p className="text-sm text-red-700">{details.formState.errors.reference.message}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold text-ink">Your KCSE grades</h1>
              <p className="text-slate-600">Enter English, Kiswahili, one Mathematics and at least four other subjects (7 minimum, 12 maximum).</p>
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select aria-label={`Subject ${i + 1}`} className="input flex-1" value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })}>
                    <option value="">Select subject…</option>
                    {subjects.filter((s) => !taken.has(s.code) || s.code === r.subject).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                  <select aria-label={`Grade for ${byCode.get(r.subject)?.name ?? `subject ${i + 1}`}`} className="input w-28" value={r.grade} onChange={(e) => setRow(i, { grade: e.target.value })}>
                    <option value="">Grade</option>
                    {GRADE_LIST.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <button type="button" aria-label="Remove subject" className="btn btn-ghost px-3" disabled={rows.length <= 1} onClick={() => setRows((x) => x.filter((_, k) => k !== i))}><Trash2 size={18} aria-hidden /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" disabled={rows.length >= 12} onClick={() => setRows((x) => [...x, { subject: '', grade: '' }])}><Plus size={18} aria-hidden /> Add subject</button>
              {gradeErr.length > 0 && (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800"><AlertCircle className="inline mr-1" size={16} aria-hidden />
                  <ul className="inline-block align-top list-disc pl-4">{gradeErr.map((e) => <li key={e}>{e}</li>)}</ul></div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold text-ink">Programme preferences <span className="text-base font-normal text-slate-500">(optional)</span></h1>
              <p className="text-slate-600">Type programmes you would like, in order (e.g. “Bachelor of Science in Nursing”). Your six suggested choices will favour them if you qualify. Leave blank for suggestions based on your results.</p>
              {pf.fields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <input aria-label={`Preference ${i + 1}`} className="input" placeholder={`Preference ${i + 1}`} {...prefs.register(`prefs.${i}.value` as const)} />
                  <button type="button" aria-label="Remove preference" className="btn btn-ghost px-3" onClick={() => pf.remove(i)}><Trash2 size={18} aria-hidden /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" disabled={pf.fields.length >= 6} onClick={() => pf.append({ value: '' })}><Plus size={18} aria-hidden /> Add preference</button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-2xl font-extrabold text-ink">Review and check</h1>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {rows.filter((r) => r.subject && r.grade).map((r) => (<div key={r.subject} className="flex justify-between border-b border-slate-100 py-1"><dt>{byCode.get(r.subject)?.name ?? r.subject}</dt><dd className="font-bold">{r.grade}</dd></div>))}
              </dl>
              <p className="text-sm text-slate-600">Results are estimates based on a published formula and past cutoffs.</p>
              {submitErr && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{submitErr}</p>}
              {busy && <p role="status" className="flex items-center gap-2 text-brand"><Loader2 className="animate-spin" aria-hidden /> Checking thousands of programme options…</p>}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button type="button" className="btn btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={18} aria-hidden /> Back</button>
            {step < 3 ? <button type="button" className="btn btn-primary" onClick={next}>Next <ArrowRight size={18} aria-hidden /></button>
              : <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Working…' : 'Show my courses'}</button>}
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
