import { motion } from 'framer-motion';

export function LogoMark({ size = 36, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48"><stop stopColor="#22D3EE" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient></defs>
      <motion.circle cx="24" cy="24" r="20" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" initial={animated ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
      <motion.path d="M13 22 24 16l11 6-11 6-11-6Zm5 4v5c0 2 3 4 6 4s6-2 6-4v-5" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" initial={animated ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, delay: animated ? 0.5 : 0 }} />
    </svg>
  );
}
