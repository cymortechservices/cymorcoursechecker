import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Short branded intro. Skippable (button, Escape, click) and shortened for reduced-motion users. */
export default function Intro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const t = window.setTimeout(onDone, reduce ? 600 : 2400);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', k);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [onDone, reduce]);
  return (
    <motion.div role="dialog" aria-label="Welcome" onClick={onDone} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy text-white"
      initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.5 } }}>
      <motion.div initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7 }} className="text-center px-6">
        <div className="text-sm font-bold tracking-[0.3em] text-cyan-300">CYMOR</div>
        <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold">CourseChecker</h1>
        <motion.div className="mx-auto mt-5 h-1 rounded bg-gradient-to-r from-cyan-300 to-violet-500" initial={reduce ? false : { width: 0 }} animate={{ width: 160 }} transition={{ delay: 0.5, duration: 1 }} />
        <p className="mt-5 text-slate-300">Find the degrees your KCSE grades qualify for.</p>
      </motion.div>
      <button onClick={(e) => { e.stopPropagation(); onDone(); }} className="absolute bottom-8 rounded-lg border border-slate-500 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">Skip intro</button>
    </motion.div>
  );
}
