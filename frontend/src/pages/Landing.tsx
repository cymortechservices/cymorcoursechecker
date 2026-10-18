import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, ShieldCheck, Target } from 'lucide-react';

const items = [
  { icon: Target, title: 'Real requirements and cutoffs', text: 'Programmes are listed only when your subjects meet the published requirements and your estimated cluster score reaches the cutoff.' },
  { icon: FileText, title: 'A clear PDF report', text: 'Your recommended application choices first, then every qualifying programme from the highest cutoff to the lowest.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'No account needed. Reports expire automatically and are only reachable with a private access token.' },
];

export default function Landing() {
  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-4xl sm:text-6xl font-extrabold max-w-3xl leading-tight">
            Which degrees can your <span className="text-cyan-300">KCSE grades</span> unlock?
          </motion.h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">Enter your grades once. We match them against KUCCPS programme requirements and cutoffs and give you a ranked list and six suggested application choices.</p>
          <Link to="/check" className="btn btn-primary mt-8 text-lg">Check my courses <ArrowRight aria-hidden /></Link>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12 grid gap-5 md:grid-cols-3">
        {items.map((i) => (
          <div key={i.title} className="card p-6">
            <i.icon className="text-brand" aria-hidden />
            <h2 className="mt-3 text-lg font-bold text-ink">{i.title}</h2>
            <p className="mt-2 text-slate-600">{i.text}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
          <strong>Estimate only.</strong> The cluster score uses a published formula that the KUCCPS documents do not print, and cutoffs are from past years. Treat results as guidance, not a placement guarantee.
        </div>
      </section>
    </>
  );
}
