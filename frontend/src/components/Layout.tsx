import { Link, NavLink } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  const link = ({ isActive }: { isActive: boolean }) => `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white'}`;
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <header className="bg-navy">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-white font-bold"><GraduationCap className="text-cyan-300" aria-hidden /> <span><span className="text-cyan-300">CYMOR</span> CourseChecker</span></Link>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/check" className={link}>Check</NavLink>
            <NavLink to="/methodology" className={link}>Method</NavLink>
            <NavLink to="/privacy" className={link}>Privacy</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-600">
          CYMOR CourseChecker is an independent guidance tool, not affiliated with KUCCPS. Scores are estimates; always confirm with the official KUCCPS portal.
        </div>
      </footer>
    </div>
  );
}
