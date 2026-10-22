import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Intro from './components/Intro';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Checker from './pages/Checker';
import Results from './pages/Results';
import Admin from './pages/Admin';
import { Methodology, Privacy, NotFound } from './pages/Info';

/** Scrolls to #hash sections (Router does not do this by itself) and to the top on page changes. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return () => window.clearTimeout(t);
    }
    window.scrollTo(0, 0);
    return undefined;
  }, [pathname, hash]);
  return null;
}

export default function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try { return !sessionStorage.getItem('cymor-intro'); } catch { return true; }
  });
  const location = useLocation();
  const done = () => { try { sessionStorage.setItem('cymor-intro', '1'); } catch { /* ignore */ } setShowIntro(false); };
  return (
    <>
      <AnimatePresence>{showIntro && <Intro onDone={done} />}</AnimatePresence>
      <ScrollManager />
      <Layout>
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/check" element={<Checker />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/results" element={<Results />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route path="/privacy" element={<Privacy />} />
              {/* friendly aliases */}
              <Route path="/features" element={<Navigate to="/#features" replace />} />
              <Route path="/how-it-works" element={<Navigate to="/#how" replace />} />
              <Route path="/faq" element={<Navigate to="/#faq" replace />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </motion.div>
      </Layout>
    </>
  );
}
