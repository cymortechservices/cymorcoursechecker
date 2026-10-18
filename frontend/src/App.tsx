import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Intro from './components/Intro';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Checker from './pages/Checker';
import Results from './pages/Results';
import { Methodology, Privacy, NotFound } from './pages/Info';

export default function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try { return !sessionStorage.getItem('cymor-intro'); } catch { return true; }
  });
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const done = () => { try { sessionStorage.setItem('cymor-intro', '1'); } catch { /* ignore */ } setShowIntro(false); };
  return (
    <>
      <AnimatePresence>{showIntro && <Intro onDone={done} />}</AnimatePresence>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/check" element={<Checker />} />
          <Route path="/results" element={<Results />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </>
  );
}
