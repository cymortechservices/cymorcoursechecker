import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export const FAQS = [
  { q: 'Is this an official KUCCPS tool?', a: 'No. CYMOR CourseChecker is independent and uses the published KUCCPS cluster and cutoff documents as its data. Always confirm your final choices on the official KUCCPS portal.' },
  { q: 'How is my cluster score calculated?', a: 'We use the commonly published weighted formula C = √((r/48) × (t/84)) × 48, where r is your points in the four subjects the programme’s cluster asks for and t is your aggregate. Those documents do not print the formula, so every score is shown as an estimate.' },
  { q: 'When is a programme shown to me?', a: 'Only when both conditions are true: you meet the programme’s published minimum subject requirements, and your estimated score is equal to or above its cutoff. A programme with no cutoff is never treated as zero.' },
  { q: 'Why do some universities show the same cutoff?', a: 'In the source cutoff table, some years print one identical value for many universities. We mark those as “shared minimum” (with *) and rank them below university-specific cutoffs so they are never mistaken for the real thing.' },
  { q: 'A programme I wanted is missing. Why?', a: 'Either your grades do not meet its requirements or cutoff, or the programme could not be matched safely to a cluster in the source documents. We exclude unmatched programmes rather than guess.' },
  { q: 'What are the six recommended choices?', a: 'Choices 1A, 1B and 1C are the same programme at three different universities; choices 2, 3 and 4 are other programmes you qualify for. If you list preferences, we favour them when you qualify.' },
  { q: 'Do I need an account? Is my data kept?', a: 'No account is needed. Your grades are stored under a random report ID so you can download your PDF, and they are deleted automatically when the report expires.' },
  { q: 'How many subjects do I need to enter?', a: 'English, Kiswahili, one Mathematics and at least four other subjects (7 minimum). We never assume or fill in a grade for you.' },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink transition hover:bg-slate-50" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
              {f.q}
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0 text-violet-600"><ChevronDown aria-hidden /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div id={`faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                  <p className="px-5 pb-5 leading-relaxed text-slate-600">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
