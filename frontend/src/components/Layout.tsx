import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, Menu, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from '../lib/site';
import { LogoMark } from './Logo';

const NAV = [
  { to: '/#features', label: 'Features' },
  { to: '/#how', label: 'How it works' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/methodology', label: 'Method' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:bg-white focus:p-3">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold text-white" onClick={() => setOpen(false)}>
            <LogoMark size={32} /> <span><span className="text-cyan-300">CYMOR</span> CourseChecker</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">{n.label}</NavLink>)}
            <Link to="/check" className="btn btn-primary ml-2 px-4 py-2 text-sm">Check my courses</Link>
          </nav>
          <button className="rounded-lg p-2 text-white md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X /> : <Menu />}</button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav aria-label="Mobile" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/10 md:hidden">
              <div className="flex flex-col gap-1 p-4">
                {NAV.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-slate-200 hover:bg-white/10">{n.label}</Link>)}
                <Link to="/check" onClick={() => setOpen(false)} className="btn btn-primary mt-2">Check my courses</Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="relative overflow-hidden bg-navy text-slate-300">
        <div className="grid-bg absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-14">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 font-display text-xl font-extrabold text-white"><LogoMark size={36} /> <span><span className="text-cyan-300">CYMOR</span> CourseChecker</span></div>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">Check which degree programmes your KCSE grades qualify for, using the published KUCCPS cluster requirements and cutoff history, and get a clear PDF with your recommended application choices.</p>
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-400"><ShieldCheck size={16} className="text-cyan-300" aria-hidden /> No account. Reports expire automatically.</p>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Product</h2>
              <ul className="mt-4 space-y-2 text-sm">
                <li><Link className="hover:text-white" to="/check">Check my courses</Link></li>
                <li><Link className="hover:text-white" to="/#features">Features</Link></li>
                <li><Link className="hover:text-white" to="/#how">How it works</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Support</h2>
              <ul className="mt-4 space-y-2 text-sm">
                <li><a className="inline-flex items-center gap-2 hover:text-white" href={`mailto:${SUPPORT_EMAIL}`}><Mail size={15} aria-hidden /> {SUPPORT_EMAIL}</a></li>
                <li><a className="inline-flex items-center gap-2 hover:text-white" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden /> WhatsApp {SUPPORT_WHATSAPP_DISPLAY}</a></li>
              </ul>
              <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-white">Learn</h2>
              <ul className="mt-4 space-y-2 text-sm">
                <li><Link className="hover:text-white" to="/methodology">How scores work</Link></li>
                <li><Link className="hover:text-white" to="/#faq">FAQ</Link></li>
                <li><Link className="hover:text-white" to="/privacy">Privacy</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <strong>Important:</strong> CYMOR CourseChecker is an independent guidance tool and is not affiliated with KUCCPS. Scores are estimates and cutoffs are from past years. Always confirm requirements and placement rules on the official KUCCPS portal.
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
            <span>© {new Date().getFullYear()} CYMORTECHSERVICES. All rights reserved.</span>
            <span>Built with care for Kenyan students.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
