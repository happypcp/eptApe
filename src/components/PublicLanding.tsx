import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Loader2, Moon, Sun, X } from 'lucide-react';
import { EXAM_LIST } from '../shared/examSpecs';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../hooks/usePWA';

interface PublicLandingProps {
  onEnterWorkspace: (examCode?: string) => void;
}

const FAQS = [
  {
    q: 'How does LexiScore keep PTE, IELTS, and Duolingo scoring rubrics independent?',
    a: 'Each examination operates on its own versioned specification table. PTE Academic and PTE Core apply 10–90 Global Scale rules (including adjacent-pair paragraph reordering and negative marking where specified); IELTS Academic and General Training evaluate strictly on 0.0–9.0 bands in 0.5 increments; and the Duolingo English Test scores on the 10–160 adaptive scale across Literacy, Comprehension, Conversation, and Production.',
  },
  {
    q: 'Are LexiScore AI scores official Pearson, IELTS, or Duolingo results?',
    a: 'No. LexiScore is transparent about AI limitations—every speaking and writing evaluation is a calibrated practice estimate built to pinpoint pronunciation, fluency, grammar, and content gaps before test day, not an official certification.',
  },
  {
    q: 'How does real-time speech evaluation work inside the browser?',
    a: 'When you practice speaking tasks, your browser captures live microphone audio and streams it securely to our server-side transcription and rubric evaluation layer. You receive word-level alignment highlights, words-per-minute pace, pause/hesitation counts, trait subscores, and targeted follow-up drills.',
  },
  {
    q: 'Can language academies and teachers manage cohorts on LexiScore?',
    a: 'Yes. Organization Owners, Teachers, and Team Managers can create isolated academy workspaces, assign timed mocks, host WebSocket-powered live group practice rooms with leaderboards, and export PDF, Excel, or CSV progress reports.',
  },
];

export const PublicLanding: React.FC<PublicLandingProps> = ({ onEnterWorkspace }) => {
  const { darkMode, toggleDarkMode, loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [selectedExam, setSelectedExam] = useState(EXAM_LIST[0].code);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  const activeSpec = EXAM_LIST.find((e) => e.code === selectedExam) || EXAM_LIST[0];

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      setShowAuthModal(false);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      if (authTab === 'login') {
        await loginWithEmail(email.trim(), password);
        setShowAuthModal(false);
      } else if (authTab === 'register') {
        await registerWithEmail(fullName.trim(), email.trim(), password);
        setShowAuthModal(false);
      } else {
        await resetPassword(email.trim());
        setAuthInfo('Password reset link sent to your email address.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('operation-not-allowed') || msg.includes('configuration-not-found')) {
        setAuthError(
          'Email/Password sign-in is not yet toggled on in your Firebase Console. Enable Email/Password in Firebase Authentication or sign in instantly with Google above.'
        );
      } else {
        setAuthError(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            LexiScore
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#exams" className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0">
              Exams
            </a>
            <a href="#ai-scoring" className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0">
              AI Scoring
            </a>
            <a href="#pricing" className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
            <a href="#guides" className="hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0">
              Guides
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Start Practicing
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="max-w-7xl mx-auto px-6 pt-16 pb-20">
        <div className="grid lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              PTE Academic · PTE Core · IELTS Academic &amp; General · Duolingo English Test
            </p>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
              Precision mock exams and AI rubric diagnostics built for test day.
            </h1>
            <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Practice every official task format inside a distraction-free computer-based testing simulator. Record
              speaking responses, analyze word-level pronunciation, evaluate essays against exam-specific criteria, and
              track readiness from a unified academic workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 text-sm font-semibold transition-colors"
              >
                Sign In to Workspace
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onEnterWorkspace('pte_academic')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Explore Practice Bank
              </button>
              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label="Toggle light and dark theme"
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <PWAInstallButton />
            </div>
          </div>

          {/* Right Column: Live Calibrated Exam Diagnostic Card (Architectural Academic Instrument) */}
          <div className="lg:col-span-6 flex">
            <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Calibrated Speaking &amp; Writing Engine</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Multi-Exam Rubric Matrix
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">5 Exams · 55+ Tasks</span>
                </div>

                <div className="mt-5 space-y-4">
                  {[
                    { exam: 'PTE Academic / Core', scale: '10–90 GSE', traits: 'Content · Pronunciation · Oral Fluency · Form · Discourse', pct: 86 },
                    { exam: 'IELTS Academic & GT', scale: 'Band 0.0–9.0', traits: 'Task Response · Coherence · Lexical Resource · Grammar', pct: 82 },
                    { exam: 'Duolingo English Test', scale: '10–160 Adaptive', traits: 'Literacy · Comprehension · Conversation · Production', pct: 89 },
                  ].map((row) => (
                    <div key={row.exam} className="pb-4 border-b border-slate-100 dark:border-slate-800/80 last:border-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.exam}</span>
                        <span className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums">
                          {row.scale}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.traits}</p>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-indigo-600 dark:bg-indigo-500" style={{ width: `${row.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>100% original authored question bank</span>
                <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="font-medium text-indigo-700 dark:text-indigo-400 hover:underline">
                  OpenAPI 3.1 Spec
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Capability Strip */}
        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-6 pt-10 border-t border-slate-200 dark:border-slate-800">
          {[
            { num: '5 Exams', label: 'Independent timing, rules & scoring scales' },
            { num: '22 + 21 + 13', label: 'PTE, IELTS & DET official task formats' },
            { num: 'Real ASR + TTS', label: 'Live mic scoring & synthesized listening tracks' },
            { num: 'PDF / XLSX / CSV', label: 'Exportable student & cohort scorecards' },
          ].map((m) => (
            <div key={m.num}>
              <div className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">{m.num}</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive 5-Exam Architecture Explorer */}
      <section id="exams" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              Five independent examination engines, zero cross-exam shortcuts.
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Select an exam below to inspect its versioned specification, native score range, and full task coverage.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
            {EXAM_LIST.map((exam) => (
              <button
                key={exam.code}
                type="button"
                onClick={() => setSelectedExam(exam.code)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedExam === exam.code
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {exam.name}
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {activeSpec.providerLabel} · Specification {activeSpec.versionTag} · Scale {activeSpec.scoreScaleMin}–{activeSpec.scoreScaleMax}
                </div>
                <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{activeSpec.name}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-3xl">{activeSpec.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onEnterWorkspace(activeSpec.code)}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Practice {activeSpec.shortName} Questions
              </button>
            </div>

            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSpec.questionTypes.map((qt) => (
                <div key={qt.code} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="capitalize font-medium text-indigo-700 dark:text-indigo-400">{qt.sectionCode}</span>
                    <span className="font-mono tabular-nums">{qt.responseTimeSec}s</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{qt.name}</div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{qt.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Scoring Methodology Transparency (AIEO) */}
      <section id="ai-scoring" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-3 gap-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Transparent, rubric-grounded AI assessment.
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              LexiScore runs all speech recognition, text-to-speech listening tracks, and essay scoring on secure
              server-side pipelines with interchangeable provider interfaces.
            </p>
          </div>
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
            {[
              {
                title: '01. Speaking & Pronunciation Diagnostics',
                body: 'Captures browser microphone recordings, transcribes verbatim speech including hesitations, measures speaking speed (WPM), aligns words against reference passages, and scores Pronunciation, Fluency, Content, Grammar, and Vocabulary.',
              },
              {
                title: '02. Criterion-Based Writing Evaluation',
                body: 'Checks word-count form compliance, highlights exact grammatical errors with corrections, suggests academic lexical upgrades, rewrites weak sentences, and provides an original high-scoring model answer.',
              },
              {
                title: '03. Automated Objective Grading',
                body: 'Enforces exact exam mechanics including PTE adjacent-pair paragraph reordering, +1/-1 negative marking on multiple-answer and highlight-incorrect-words tasks, and accepted spelling variants.',
              },
              {
                title: '04. Official Score Honesty',
                body: 'Every AI scorecard clearly notes that LexiScore outputs calibrated practice estimates for skill diagnosis—never misrepresenting third-party AI scores as official Pearson, IELTS, or Duolingo certifications.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
                Transparent plans for solo learners and academies.
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Supports global Stripe billing alongside Khalti and eSewa gateway adapters for Nepal.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  billingCycle === 'monthly'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  billingCycle === 'annual'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Annual (Save 25%)
              </button>
            </div>
          </div>

          <div className="mt-10 grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: 'Free Explorer', audience: 'Self-starters', m: 0, a: 0, limit: '15 drills/day · 3 AI scores/day' },
              { name: 'Basic Prep', audience: 'Daily practice', m: 19, a: 14, limit: '100 drills/day · 15 AI scores/day' },
              { name: 'Premium Achiever', audience: 'Target score focus', m: 39, a: 27, limit: 'Unlimited mocks · 60 AI scores/day · AI Tutor', featured: true },
              { name: 'Professional', audience: 'Intensive mastery', m: 69, a: 50, limit: '200 AI scores/day · Priority processing' },
              { name: 'Institutional', audience: 'Schools & academies', m: 199, a: 150, limit: '50 seats · Live teams · Branded reports' },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-xl border p-5 flex flex-col justify-between ${
                  p.featured
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.audience}</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{p.name}</div>
                  <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    ${billingCycle === 'annual' ? p.a : p.m}
                    <span className="text-xs font-sans font-normal text-slate-500"> / mo</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{p.limit}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className={`mt-6 w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
                    p.featured
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.m === 0 ? 'Start Free' : 'Choose Plan'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Structured FAQ (AEO) */}
      <section id="guides" className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Examination Format &amp; Scoring FAQ
        </h2>
        <div className="mt-6 divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
          {FAQS.map((item, idx) => (
            <div key={idx} className="py-4">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                <span>{item.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === idx && (
                <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} LexiScore. Original English Proficiency Preparation Platform.</span>
          <div className="flex items-center gap-5">
            <a href="/robots.txt" target="_blank" rel="noreferrer" className="hover:underline">
              robots.txt
            </a>
            <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="hover:underline">
              sitemap.xml
            </a>
            <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="hover:underline">
              OpenAPI Spec
            </a>
          </div>
        </div>
      </footer>

      {/* Auth Modal (Google Sign-In + Email/Password + Password Reset) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setShowAuthModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {authTab === 'login' ? 'Sign in to LexiScore' : authTab === 'register' ? 'Create LexiScore Account' : 'Reset Password'}
              </h2>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authBusy}
              className="mt-5 w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-indigo-600" />}
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              <span>or use email &amp; password</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {authTab === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              {authTab !== 'reset' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              {authError && <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{authError}</p>}
              {authInfo && <p className="text-xs text-emerald-700 dark:text-emerald-400">{authInfo}</p>}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {authTab === 'login' ? 'Sign In' : authTab === 'register' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              {authTab === 'login' ? (
                <>
                  <button type="button" onClick={() => setAuthTab('register')} className="hover:text-indigo-600">
                    Need an account? Register
                  </button>
                  <button type="button" onClick={() => setAuthTab('reset')} className="hover:text-indigo-600">
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setAuthTab('login')} className="hover:text-indigo-600">
                  Back to Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
