import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { SubjectInfo } from '../lib/api';

/**
 * Touch-friendly subject picker. Replaces the native <select>, which is unreliable inside
 * animated/transformed containers on some mobile browsers. Opens a bottom sheet with search.
 */
export default function SubjectPicker({ value, options, onChange, label }: { value: string; options: SubjectInfo[]; onChange: (code: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.code === value);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [open]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.name.toLowerCase().includes(n) || o.code.toLowerCase().includes(n)) : options;
  }, [q, options]);

  const choose = (code: string) => { onChange(code); setOpen(false); setQ(''); };

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}
        className="input flex min-h-[44px] flex-1 items-center justify-between gap-2 text-left" style={{ minWidth: 180 }}>
        <span className={selected ? 'font-semibold text-ink' : 'text-slate-500'}>{selected ? selected.name : 'Select subject…'}</span>
        <ChevronDown size={18} className="shrink-0 text-slate-400" aria-hidden />
      </button>

      {/* Portal to <body>: position:fixed inside a transformed (animated) ancestor is positioned relative to that ancestor, which breaks overlays on mobile. */}
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[70] flex items-end justify-center bg-navy/70 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onAnimationComplete={() => inputRef.current?.focus({ preventScroll: true })}
              className="flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h3 className="font-display text-lg font-extrabold text-ink">Choose subject</h3>
                <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={20} aria-hidden /></button>
              </div>
              <div className="relative px-5 pb-3">
                <Search size={16} className="absolute left-8 top-3.5 text-slate-400" aria-hidden />
                <input ref={inputRef} className="input pl-9" placeholder="Search subjects" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <ul className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
                {list.length === 0 && <li className="p-6 text-center text-slate-500">No subject matches “{q}”.</li>}
                {list.map((o) => (
                  <li key={o.code}>
                    <button type="button" onClick={() => choose(o.code)} className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 py-3 text-left text-base transition active:bg-violet-100 ${o.code === value ? 'bg-violet-50 font-semibold text-violet-800' : 'text-ink hover:bg-slate-50'}`}>
                      <span>{o.name}</span>{o.code === value && <Check size={18} aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
