import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { EXAM_LIST, EXAM_SPECS, ExamCode } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';

interface TutorMsg {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

interface TutorViewProps {
  selectedExam: ExamCode;
  onSelectExam: (code: ExamCode) => void;
}

const STARTERS: Record<ExamCode, string[]> = {
  pte_academic: [
    'Give me a 10-minute pronunciation & oral fluency drill for Read Aloud.',
    'Explain how adjacent-pair scoring works in PTE Re-order Paragraphs with an example.',
    'Review my Summarize Written Text structure and show how to stay under 75 words.',
    'How should I approach the new Summarize Group Discussion task?',
  ],
  pte_core: [
    'Give me a formal vs semi-formal template checklist for PTE Core Write Email.',
    'How do I structure a natural 40-second response for Respond to a Situation?',
    'Drill me on workplace vocabulary for Describe Image.',
    'How is PTE Core scored for Canadian immigration benchmarks?',
  ],
  ielts_academic: [
    'Show me how to write an overview paragraph for IELTS Academic Writing Task 1 charts.',
    'Conduct a simulated IELTS Speaking Part 3 follow-up interview on urban technology.',
    'Give me 10 Band 8.0 cohesive devices and warn me against mechanical overuse.',
    'Explain True / False / Not Given trap patterns in IELTS Reading.',
  ],
  ielts_general: [
    'Help me differentiate tone between formal, semi-formal, and informal Task 1 letters.',
    'Create a Band 8.0 outline for an IELTS General Task 2 opinion essay.',
    'Give me realistic IELTS Speaking Part 2 cue card practice with follow-ups.',
    'How do I avoid losing marks on spelling in IELTS Listening Form Completion?',
  ],
  det: [
    'Explain how DET subscores (Literacy, Comprehension, Conversation, Production) are weighted.',
    'Give me a high-scoring strategy for Interactive Reading and Highlight the Answer.',
    'Coach me on speaking continuously for 90 seconds in Speak About the Photo.',
    'How should I pace my 5-minute Writing Sample for C1 lexical range?',
  ],
};

export const TutorView: React.FC<TutorViewProps> = ({ selectedExam, onSelectExam }) => {
  const spec = EXAM_SPECS[selectedExam] || EXAM_SPECS.pte_academic;
  const [messages, setMessages] = useState<TutorMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ messages: TutorMsg[] }>(`/api/ai/tutor?exam=${selectedExam}`, {
        requireToken: true,
      });
      setMessages(data.messages || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load tutor conversation.');
    } finally {
      setLoading(false);
    }
  }, [selectedExam]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textToSend?: string) => {
    const clean = (textToSend ?? input).trim();
    if (!clean || sending) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: clean }]);
    setSending(true);

    try {
      const data = await apiFetch<{ reply: string }>('/api/ai/tutor', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({ examCode: selectedExam, message: clean }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI Tutor could not reply right now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      {/* Left Context Panel */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
            <Sparkles className="w-3.5 h-3.5" /> Exam-Calibrated AI Coach
          </div>
          <h1 className="mt-1 text-base font-bold text-slate-900 dark:text-white">LexiScore Personal Tutor</h1>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Grounded in your target score, recent assessment history, and the official rubric for the selected test.
          </p>

          <div className="mt-4">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Active Exam Context
            </label>
            <select
              value={selectedExam}
              onChange={(e) => onSelectExam(e.target.value as ExamCode)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
            >
              {EXAM_LIST.map((ex) => (
                <option key={ex.code} value={ex.code}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white">Quick Coaching Drills</h2>
          <div className="mt-3 space-y-2">
            {(STARTERS[selectedExam] || STARTERS.pte_academic).map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => sendMessage(prompt)}
                className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Chat Stream */}
      <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[640px]">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{spec.name} Coaching Thread</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Scale {spec.scoreScaleMin}–{spec.scoreScaleMax} {spec.scoreUnit} · History persisted to PostgreSQL
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading coaching history...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Start your {spec.shortName} coaching session
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Ask for grammar corrections, essay outlines, speaking fluency exercises, or click any starter drill on the left.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={m.id || i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> Preparing rubric-aligned coaching...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-600 dark:text-red-400 border-t border-slate-200 dark:border-slate-800">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${spec.shortName} speaking, writing, grammar, or timing...`}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> Send
          </button>
        </form>
      </div>
    </div>
  );
};
