import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from './Logo';

const LINES = ['Reading your grades…', 'Matching cluster subjects…', 'Comparing with cutoffs…', 'Ready.'];

/** Branded preloader: ~2.4 s, skippable (button / Esc / click), near-instant for reduced-motion users. */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (reduce) { const t = window.setTimeout(onDone, 400); return () => window.clearTimeout(t); }
    const start = performance.now();
    const total = 2300;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total);
      setPct(Math.round((1 - Math.pow(1 - p, 3)) * 100));
      if (p < 1) raf = requestAnimationFrame(tick); else window.setTimeout(onDone, 250);
    };
    raf = requestAnimationFrame(tick);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', k);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', k); };
  }, [onDone, reduce]);

  const word = 'CourseChecker'.split('');
  const line = LINES[Math.min(LINES.length - 1, Math.floor(pct / 26))];
  return (
    <motion.div role="dialog" aria-label="Loading" onClick={onDone} className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-navy text-white"
      initial={{ y: 0 }} exit={{ y: '-100%', transition: { duration: reduce ? 0 : 0.8, ease: [0.76, 0, 0.24, 1] } }}>
      <div className="grid-bg absolute inset-0" aria-hidden />
      <div className="absolute -left-20 top-1/4 h-80 w-80 animate-blob rounded-full bg-violet-600/40 blur-3xl" aria-hidden />
      <div className="absolute -right-20 bottom-1/4 h-80 w-80 animate-blob rounded-full bg-cyan-400/30 blur-3xl [animation-delay:-5s]" aria-hidden />

      <div className="relative flex flex-col items-center px-6 text-center">
        <LogoMark size={96} animated />
        <div className="mt-6 text-xs font-bold tracking-[0.5em] text-cyan-300">CYMOR</div>
        <h1 className="mt-2 flex text-4xl font-extrabold sm:text-6xl" aria-label="CourseChecker">
          {word.map((c, i) => (
            <motion.span key={i} initial={reduce ? false : { y: 40, opacity: 0, filter: 'blur(8px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.5 + i * 0.045, duration: 0.5 }}>{c}</motion.span>
          ))}
        </h1>
        <motion.p className="mt-4 max-w-sm text-slate-300" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>Find the degrees your KCSE grades qualify for.</motion.p>

        <div className="mt-10 w-72 sm:w-96">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-400 to-fuchsia-400" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{line}</span><span className="tabular-nums">{pct}%</span></div>
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDone(); }} className="absolute bottom-8 rounded-full border border-white/25 px-5 py-2 text-sm text-slate-200 transition hover:bg-white/10">Skip</button>
    </motion.div>
  );
}
