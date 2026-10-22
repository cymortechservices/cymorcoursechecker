import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, BarChart3, CheckCircle2, ClipboardList, FileText, Filter, Layers, Lock, Scale, Sparkles, Target } from 'lucide-react';
import { Counter, Reveal } from '../components/Reveal';
import { Faq } from '../components/Faq';

const CHIPS = [
  { t: 'A', c: 'left-[4%] top-[18%]', r: '-8deg', d: '0s' },
  { t: 'B+', c: 'right-[6%] top-[14%]', r: '10deg', d: '-1.5s' },
  { t: 'A-', c: 'left-[12%] bottom-[16%]', r: '6deg', d: '-3s' },
  { t: 'B', c: 'right-[10%] bottom-[22%]', r: '-12deg', d: '-4.5s' },
  { t: 'C+', c: 'left-[44%] top-[6%]', r: '4deg', d: '-2s' },
];

const STATS = [
  { to: 7, suffix: '', label: 'years of cutoff history (2018–2024)' },
  { to: 20, suffix: '', label: 'KUCCPS clusters supported' },
  { to: 6, suffix: '', label: 'application choices suggested' },
  { to: 0, suffix: '', label: 'accounts needed' },
];

const FEATURES = [
  { icon: Target, title: 'Real requirements, real cutoffs', text: 'A programme appears only when your subjects meet its published minimums and your estimated score reaches the cutoff. No guessing, no padding.' },
  { icon: Scale, title: 'Exact comparison', text: 'A score exactly equal to the cutoff counts. Comparisons use exact integer maths, so rounding never changes the outcome.' },
  { icon: Layers, title: 'Every university, own cutoff', text: 'The same programme is checked at each university separately, using that university’s own cutoff wherever the source has one.' },
  { icon: BadgeCheck, title: 'Honest about shared cutoffs', text: 'Where the source prints one identical value for many universities, we label it “shared minimum” instead of pretending it is specific.' },
  { icon: Sparkles, title: 'Six smart choices', text: 'Get 1A–1C (one programme at three universities) plus choices 2–4, or tell us your preferences and we will favour them.' },
  { icon: FileText, title: 'Beautiful PDF report', text: 'Your recommended choices first, then every qualifying programme from the highest cutoff to the lowest, with clear colours and page numbers.' },
  { icon: Filter, title: 'Search, sort and filter', text: 'Search by programme or university, sort by cutoff or margin, and filter Safe, Balanced or Competitive options.' },
  { icon: Lock, title: 'Private by design', text: 'No sign-up. Reports use random IDs and a private token, and are deleted automatically when they expire.' },
];

const STEPS = [
  { icon: ClipboardList, title: 'Enter your grades', text: 'Mathematics, English, Kiswahili and your other subjects (at least seven), with a tap on each grade. Your aggregate uses Mathematics, your better language and your best five other subjects.' },
  { icon: BarChart3, title: 'We do the matching', text: 'Your subjects are matched to cluster rules, scored, and compared with each programme’s cutoff.' },
  { icon: CheckCircle2, title: 'Get your shortlist', text: 'See how many courses you qualify for free, then unlock every programme, your six recommended choices and the PDF report for one small payment.' },
];

export default function Landing() {
  const reduce = useReducedMotion();
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="absolute -left-32 top-10 h-[28rem] w-[28rem] animate-blob rounded-full bg-violet-600/40 blur-3xl" aria-hidden />
        <div className="absolute -right-32 bottom-0 h-[28rem] w-[28rem] animate-blob rounded-full bg-cyan-400/25 blur-3xl [animation-delay:-6s]" aria-hidden />
        {!reduce && CHIPS.map((c) => (
          <span key={c.t} aria-hidden style={{ ['--r' as string]: c.r, animationDelay: c.d } as CSSProperties} className={`glass absolute hidden animate-float rounded-2xl px-4 py-2 font-display text-2xl font-extrabold text-cyan-200 shadow-xl md:block ${c.c}`}>{c.t}</span>
        ))}
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:py-28 lg:grid-cols-2">
          <div>
            <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-cyan-100"><Sparkles size={14} aria-hidden /> Built on the published KUCCPS cluster and cutoff documents</motion.span>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }} className="mt-6 text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Which degrees can your <span className="shimmer-text">KCSE grades</span> unlock?
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Enter your grades once. We match them against programme requirements and cutoffs at every university, give you six recommended application choices, and a PDF to take with you.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.7 }} className="mt-8 flex flex-wrap gap-3">
              <Link to="/check" className="btn btn-primary text-lg">Check my courses <ArrowRight aria-hidden /></Link>
              <a href="#how" className="btn btn-light text-lg">How it works</a>
            </motion.div>
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
              {['No sign-up', 'Takes about 2 minutes', 'KSh 149 unlocks results + PDF', 'Report emailed to you'].map((t) => <li key={t} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-cyan-300" aria-hidden />{t}</li>)}
            </motion.ul>
          </div>

          {/* Illustrative preview card */}
          <motion.div initial={{ opacity: 0, y: 40, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.3, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-violet-500/30 to-cyan-400/30 blur-2xl" aria-hidden />
            <div className="relative rounded-3xl border border-white/15 bg-white p-5 text-slate-800 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg font-extrabold text-ink">Your recommended choices</div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Sample preview</span>
              </div>
              <div className="mt-4 space-y-3">
                {[['1A', 'Programme name', 'University one', 'Safe', 'bg-emerald-100 text-emerald-800'], ['1B', 'Programme name', 'University two', 'Balanced', 'bg-amber-100 text-amber-800'], ['1C', 'Programme name', 'University three', 'Competitive', 'bg-indigo-100 text-indigo-800'], ['2', 'Another programme', 'University four', 'Balanced', 'bg-amber-100 text-amber-800']].map(([c, p, u, l, cls], i) => (
                  <motion.div key={c} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.12 }} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg font-extrabold text-white ${c!.startsWith('1') ? 'bg-violet-600' : 'bg-navy'}`}>{c}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold text-ink">{p}</div><div className="truncate text-sm text-slate-500">{u}</div></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{l}</span>
                  </motion.div>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">Illustration only. Your real results use your grades.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="text-center">
              <div className="font-display text-4xl font-extrabold text-violet-700"><Counter to={s.to} suffix={s.suffix} /></div>
              <div className="mt-1 text-sm text-slate-600">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-violet-600">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">From grades to a shortlist in three steps</h2>
        </Reveal>
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-12 hidden h-0.5 bg-gradient-to-r from-violet-300 via-cyan-300 to-violet-300 md:block" aria-hidden />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.12}>
              <motion.div whileHover={{ y: -6 }} className="card relative h-full p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30"><s.icon aria-hidden /></div>
                <div className="mt-1 text-xs font-bold text-slate-400">STEP {i + 1}</div>
                <h3 className="mt-2 text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-slate-600">{s.text}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-gradient-to-b from-white to-slate-100 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-violet-600">Features</p>
            <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Everything you need to choose with confidence</h2>
            <p className="mt-3 text-slate-600">Built to be accurate first, and clear second.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 0.08}>
                <motion.div whileHover={{ y: -6, boxShadow: '0 20px 40px -20px rgba(109,40,217,.35)' }} className="card group h-full p-6 transition-colors hover:border-violet-300">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white"><f.icon aria-hidden /></div>
                  <h3 className="mt-4 text-lg font-bold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST BAND */}
      <section className="relative overflow-hidden bg-navy py-16 text-white">
        <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Transparent about what we know, and what we don’t.</h2>
            <p className="mt-4 text-slate-300">The cluster-score formula is published by third parties, and past cutoffs do not guarantee future placement. We say so on every result and in every PDF, so you can plan with your eyes open.</p>
            <Link to="/methodology" className="btn btn-light mt-6">Read the method <ArrowRight size={18} aria-hidden /></Link>
          </Reveal>
          <Reveal delay={0.15}>
            <ul className="space-y-3">
              {['Scores are always labelled as estimates', 'Missing cutoffs are never treated as zero', 'Programmes we cannot match safely are excluded, not guessed', 'Cutoff year is shown for every result'].map((t) => (
                <li key={t} className="glass flex items-start gap-3 rounded-xl p-4"><CheckCircle2 className="mt-0.5 shrink-0 text-cyan-300" size={20} aria-hidden /> {t}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-violet-600">FAQ</p>
          <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <Reveal className="mt-10" delay={0.1}><Faq /></Reveal>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20">
        <Reveal>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-r from-violet-700 via-indigo-700 to-cyan-600 p-10 text-center text-white shadow-2xl sm:p-14">
            <div className="absolute -right-10 -top-10 h-56 w-56 animate-blob rounded-full bg-white/10 blur-2xl" aria-hidden />
            <h2 className="relative text-3xl font-extrabold sm:text-4xl">Ready to see your options?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/85">It takes about two minutes and you do not need an account.</p>
            <Link to="/check" className="btn relative mt-8 bg-white text-lg text-violet-700 shadow-xl hover:-translate-y-0.5">Check my courses <ArrowRight aria-hidden /></Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
