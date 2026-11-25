import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { EXAM_SPECS, ExamCode, formatExamScore } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { ExamAudioPlayer, SpeechRecorder } from './AudioControls';
import { ExamVisualRenderer } from './ExamVisuals';

export interface QuestionRecord {
  id: number;
  externalCode: string;
  examCode: string;
  sectionCode: string;
  typeCode: string;
  title: string;
  difficulty: string;
  topic: string;
  promptText: string;
  stimulusJson: Record<string, unknown>;
  mediaJson: Record<string, unknown>;
  answerKeyJson: Record<string, unknown>;
  explanation: string;
  scoringConfigJson?: Record<string, unknown>;
  status?: string;
}

interface SpeakingEval {
  transcript: string;
  overallScore: number;
  scoreUnit: string;
  subscores: { pronunciation: number; fluency: number; content: number; grammar: number; vocabulary: number };
  metrics: {
    wordsPerMinute: number;
    pauseCount: number;
    hesitationCount: number;
    repetitionCount: number;
    completenessPct: number;
    audioQualityLabel: string;
  };
  wordFeedback: Array<{ word: string; status: string; note?: string }>;
  missingWords: string[];
  improvements: string[];
  suggestedExercises: string[];
  summary: string;
  disclaimer: string;
}

interface WritingEval {
  overallScore: number;
  scoreUnit: string;
  wordCount: number;
  criteriaScores: Array<{ criterion: string; score: number; maxScore: number; comment: string }>;
  grammarErrors: Array<{ original: string; correction: string; category: string; reason: string }>;
  vocabularySuggestions: Array<{ original: string; upgrade: string; contextNote: string }>;
  sentenceImprovements: Array<{ original: string; improved: string; why: string }>;
  improvedVersion: string;
  modelAnswer: string;
  feedbackSummary: string;
  disclaimer: string;
}

interface ObjectiveResult {
  score: number;
  maxScore: number;
  isCorrect: boolean;
  accuracyPct: number;
  breakdown: Array<{ label: string; expected: string; submitted: string; correct: boolean; points: number }>;
  mistakeSummary: string;
}

interface QuestionRendererProps {
  question: QuestionRecord;
  mode: 'practice' | 'mock';
  attemptId?: number;
  value: Record<string, unknown>;
  onChange: (val: Record<string, unknown>) => void;
  isAuthenticated: boolean;
  onRequireAuth?: () => void;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  mode,
  attemptId,
  value,
  onChange,
  isAuthenticated,
  onRequireAuth,
}) => {
  const spec = EXAM_SPECS[question.examCode as ExamCode] || EXAM_SPECS.pte_academic;
  const qtSpec = spec.questionTypes.find((t) => t.code === question.typeCode);
  const mechanic = qtSpec?.uiMechanic || 'mc_single';
  const stimulus = question.stimulusJson || {};

  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [objectiveFeedback, setObjectiveFeedback] = useState<{
    result: ObjectiveResult;
    explanation: string;
  } | null>(null);
  const [speakingEval, setSpeakingEval] = useState<SpeakingEval | null>(null);
  const [writingEval, setWritingEval] = useState<WritingEval | null>(null);
  const [capturedAudio, setCapturedAudio] = useState<{
    audioBase64: string;
    audioMime: string;
    durationSec: number;
  } | null>(null);
  const [manualTranscript, setManualTranscript] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Reset feedback when switching questions
  useEffect(() => {
    setObjectiveFeedback(null);
    setSpeakingEval(null);
    setWritingEval(null);
    setGradeError(null);
    setCapturedAudio(null);
    setManualTranscript('');
  }, [question.id]);

  // Initialize default order for reorder_paragraphs
  const reorderItems = Array.isArray(stimulus.items)
    ? (stimulus.items as Array<{ id: string; text: string }>)
    : [];
  const currentOrder: string[] =
    Array.isArray(value.order) && (value.order as string[]).length === reorderItems.length
      ? (value.order as string[])
      : reorderItems.map((i) => i.id);

  const moveParagraph = (from: number, to: number) => {
    if (to < 0 || to >= currentOrder.length) return;
    const next = [...currentOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...value, order: next });
  };

  const handleGradeObjective = async () => {
    setGrading(true);
    setGradeError(null);
    try {
      const payload =
        mechanic === 'reorder_paragraphs' && !value.order ? { ...value, order: currentOrder } : value;
      const res = await apiFetch<{ result: ObjectiveResult; explanation: string }>(
        '/api/practice/grade-objective',
        {
          method: 'POST',
          body: JSON.stringify({ questionId: question.id, submittedAnswer: payload, timeSpentSec: 45 }),
        }
      );
      setObjectiveFeedback(res);
    } catch (err: unknown) {
      setGradeError(err instanceof Error ? err.message : 'Unable to grade response.');
    } finally {
      setGrading(false);
    }
  };

  const handleEvaluateSpeaking = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    if (!capturedAudio && !manualTranscript.trim()) {
      setGradeError('Record your voice with the microphone or enter a spoken transcript first.');
      return;
    }
    setGrading(true);
    setGradeError(null);
    try {
      const res = await apiFetch<{ evaluation: SpeakingEval }>('/api/ai/evaluate-speaking', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          questionId: question.id,
          attemptId,
          examCode: question.examCode,
          typeCode: question.typeCode,
          taskName: qtSpec?.name || question.typeCode,
          promptText: question.promptText,
          referenceText:
            typeof question.answerKeyJson?.referenceText === 'string'
              ? question.answerKeyJson.referenceText
              : typeof stimulus.passage === 'string'
              ? stimulus.passage
              : typeof stimulus.visualSummary === 'string'
              ? stimulus.visualSummary
              : undefined,
          audioBase64: capturedAudio?.audioBase64,
          audioMime: capturedAudio?.audioMime,
          manualTranscript: manualTranscript.trim() || undefined,
          durationSec: capturedAudio?.durationSec || 30,
        }),
      });
      setSpeakingEval(res.evaluation);
      onChange({ ...value, transcript: res.evaluation.transcript, aiScored: true });
    } catch (err: unknown) {
      setGradeError(err instanceof Error ? err.message : 'AI speaking evaluation failed.');
    } finally {
      setGrading(false);
    }
  };

  const handleEvaluateWriting = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    const essayText = String(value.essayText || '').trim();
    if (essayText.split(/\s+/).filter(Boolean).length < 5) {
      setGradeError('Write at least 5 words before running AI evaluation.');
      return;
    }
    setGrading(true);
    setGradeError(null);
    try {
      const res = await apiFetch<{ evaluation: WritingEval }>('/api/ai/evaluate-writing', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          questionId: question.id,
          attemptId,
          examCode: question.examCode,
          typeCode: question.typeCode,
          taskName: qtSpec?.name || question.typeCode,
          promptText: question.promptText,
          stimulusText:
            typeof stimulus.passage === 'string'
              ? stimulus.passage
              : typeof stimulus.visualSummary === 'string'
              ? stimulus.visualSummary
              : typeof stimulus.audioScript === 'string'
              ? stimulus.audioScript
              : undefined,
          essayText,
          minWords: Number(stimulus.minWords) || undefined,
          maxWords: Number(stimulus.maxWords) || undefined,
        }),
      });
      setWritingEval(res.evaluation);
    } catch (err: unknown) {
      setGradeError(err instanceof Error ? err.message : 'AI writing evaluation failed.');
    } finally {
      setGrading(false);
    }
  };

  const renderInlineTemplate = (isDropdown: boolean) => {
    const template = String(stimulus.template || '');
    const optionsMap = (stimulus.options || {}) as Record<string, string[]>;
    const blanks = (value.blanks || {}) as Record<string, string>;
    const parts = template.split(/(\{\{\d+\}\})/g);

    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-[15px] leading-8 text-slate-800 dark:text-slate-200">
        {parts.map((part, idx) => {
          const match = part.match(/^\{\{(\d+)\}\}$/);
          if (!match) return <span key={idx}>{part}</span>;
          const key = match[1];
          const curVal = blanks[key] || '';
          if (isDropdown) {
            const opts = optionsMap[key] || [];
            return (
              <select
                key={idx}
                aria-label={`Blank ${key}`}
                value={curVal}
                onChange={(e) => onChange({ ...value, blanks: { ...blanks, [key]: e.target.value } })}
                className="mx-1.5 inline-block rounded-md border border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/60 px-2.5 py-1 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select #{key}</option>
                {opts.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={idx}
              type="text"
              aria-label={`Blank ${key}`}
              placeholder={`Blank ${key}`}
              value={curVal}
              onChange={(e) => onChange({ ...value, blanks: { ...blanks, [key]: e.target.value } })}
              className="mx-1.5 inline-block w-36 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          );
        })}
      </div>
    );
  };

  const essayText = String(value.essayText || '');
  const essayWordCount = essayText.trim() ? essayText.trim().split(/\s+/).length : 0;
  const minW = Number(stimulus.minWords) || 0;
  const maxW = Number(stimulus.maxWords) || 0;

  return (
    <div className="space-y-5">
      {/* Task Header Metadata — clean unboxed text per Zero-Pill Discipline */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-indigo-700 dark:text-indigo-400">{spec.name}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{question.sectionCode}</span>
            <span aria-hidden="true">·</span>
            <span>{qtSpec?.name || question.typeCode}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{question.difficulty}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{question.title}</h2>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          {question.externalCode}
        </span>
      </div>

      {/* Prompt Instruction */}
      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
        {question.promptText}
      </p>

      {/* Audio Stimulus Player if applicable */}
      {(typeof stimulus.audioScript === 'string' || Array.isArray(stimulus.multiSpeaker)) && (
        <ExamAudioPlayer
          audioScript={typeof stimulus.audioScript === 'string' ? stimulus.audioScript : undefined}
          multiSpeaker={
            Array.isArray(stimulus.multiSpeaker)
              ? (stimulus.multiSpeaker as Array<{ speaker: string; text: string }>)
              : undefined
          }
          voiceName={typeof question.mediaJson?.voiceName === 'string' ? question.mediaJson.voiceName : 'Kore'}
          maxPlays={Number(stimulus.maxPlays) || 1}
          practiceMode={mode === 'practice'}
        />
      )}

      {/* Visual Stimulus (Charts / Process Diagrams / DET Photos) */}
      {typeof stimulus.visualType === 'string' && (
        <ExamVisualRenderer
          visualKey={stimulus.visualType}
          title={typeof stimulus.visualTitle === 'string' ? stimulus.visualTitle : undefined}
        />
      )}

      {/* Reading Passage Stimulus (for read_aloud, summarize_written_text, MC, TFNG, Matching, Summary Completion) */}
      {typeof stimulus.passage === 'string' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-[15px] leading-7 text-slate-800 dark:text-slate-200 max-w-[75ch] whitespace-pre-line">
          {stimulus.passage}
        </div>
      )}

      {/* ==================== INTERACTIVE RESPONSE CONTROLS ==================== */}

      {/* 1. SPEAKING TASKS */}
      {qtSpec?.scoringMode === 'ai_speaking' && (
        <div className="space-y-4">
          <SpeechRecorder
            responseTimeSec={qtSpec.responseTimeSec || 40}
            onRecordingComplete={(rec) => {
              setCapturedAudio({
                audioBase64: rec.audioBase64,
                audioMime: rec.audioMime,
                durationSec: rec.durationSec,
              });
              onChange({ ...value, recordedDurationSec: rec.durationSec, hasAudio: true });
            }}
          />

          <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3.5 text-xs">
            <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-400">
              Accessibility / No-Mic Option: Paste or type spoken transcript for rubric check
            </summary>
            <textarea
              rows={3}
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              placeholder="Optional: if you cannot use a microphone right now, type what you would speak to test rubric scoring..."
              className="mt-2.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleEvaluateSpeaking}
              disabled={grading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {grading ? 'Transcribing & Scoring Speaking...' : 'Evaluate Speaking with AI'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Rubric: {qtSpec.rubricTraits.join(' · ')}
            </span>
          </div>
        </div>
      )}

      {/* 2. WRITING TASKS */}
      {qtSpec?.scoringMode === 'ai_writing' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Write your response below</span>
            <span
              className={`font-mono tabular-nums font-medium ${
                minW > 0 && essayWordCount < minW
                  ? 'text-amber-600 dark:text-amber-400'
                  : maxW > 0 && essayWordCount > maxW
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {essayWordCount} words{minW > 0 ? ` (Target: ${minW}${maxW ? `–${maxW}` : '+'})` : ''}
            </span>
          </div>
          <textarea
            rows={10}
            value={essayText}
            onChange={(e) => onChange({ ...value, essayText: e.target.value })}
            placeholder="Compose your complete response here..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleEvaluateWriting}
              disabled={grading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {grading ? 'Running Criterion Rubric Analysis...' : 'Evaluate Writing with AI'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Rubric: {qtSpec.rubricTraits.join(' · ')}
            </span>
          </div>
        </div>
      )}

      {/* 3. SINGLE CHOICE / TFNG / YNNG / HCS / SMW */}
      {mechanic === 'mc_single' && Array.isArray(stimulus.options) && (
        <div className="space-y-2.5">
          {typeof stimulus.question === 'string' && (
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stimulus.question}</p>
          )}
          {(stimulus.options as Array<{ id: string; text: string }>).map((opt) => {
            const selected = value.selectedOption === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ ...value, selectedOption: opt.id })}
                className={`w-full text-left rounded-xl border p-4 transition-colors flex items-start gap-3 ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-mono font-semibold ${
                    selected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {opt.id.length <= 2 ? opt.id : selected ? '✓' : ''}
                </span>
                <span className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{opt.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 4. MULTIPLE CHOICE MULTIPLE ANSWERS */}
      {mechanic === 'mc_multiple' && Array.isArray(stimulus.options) && (
        <div className="space-y-2.5">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Select all supported options. PTE negative marking deducts 1 point per incorrect selection (minimum 0).
          </p>
          {(stimulus.options as Array<{ id: string; text: string }>).map((opt) => {
            const selectedArr = Array.isArray(value.selectedOptions) ? (value.selectedOptions as string[]) : [];
            const checked = selectedArr.includes(opt.id);
            const toggle = () => {
              const next = checked ? selectedArr.filter((i) => i !== opt.id) : [...selectedArr, opt.id];
              onChange({ ...value, selectedOptions: next });
            };
            return (
              <button
                key={opt.id}
                type="button"
                onClick={toggle}
                className={`w-full text-left rounded-xl border p-4 transition-colors flex items-start gap-3 ${
                  checked
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-mono font-semibold ${
                    checked
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {checked ? '✓' : opt.id}
                </span>
                <span className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{opt.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 5. RE-ORDER PARAGRAPHS (Drag-and-Drop + Accessible Up/Down) */}
      {mechanic === 'reorder_paragraphs' && reorderItems.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drag cards into logical sequence or use the arrow buttons.
          </p>
          {currentOrder.map((id, idx) => {
            const item = reorderItems.find((i) => i.id === id);
            if (!item) return null;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) moveParagraph(dragIdx, idx);
                  setDragIdx(null);
                }}
                className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-1.5 pt-0.5 text-slate-400">
                  <GripVertical className="w-4 h-4" />
                  <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 w-4">
                    {idx + 1}.
                  </span>
                </div>
                <p className="flex-1 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{item.text}</p>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label="Move paragraph up"
                    disabled={idx === 0}
                    onClick={() => moveParagraph(idx, idx - 1)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move paragraph down"
                    disabled={idx === currentOrder.length - 1}
                    onClick={() => moveParagraph(idx, idx + 1)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. FILL IN THE BLANKS (Dropdown or Input) */}
      {mechanic === 'fill_blanks_dropdown' && renderInlineTemplate(true)}
      {mechanic === 'fill_blanks_input' && renderInlineTemplate(false)}

      {/* 7. DET READ AND COMPLETE (C-Test) */}
      {mechanic === 'c_test_complete' && Array.isArray(stimulus.segments) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-[15px] leading-9 text-slate-800 dark:text-slate-200">
          {(stimulus.segments as Array<{ type: string; value?: string; id?: string; length?: number }>).map(
            (seg, idx) => {
              if (seg.type === 'text') return <span key={idx}>{seg.value}</span>;
              const blanks = (value.blanks || {}) as Record<string, string>;
              const id = seg.id || String(idx);
              return (
                <input
                  key={idx}
                  type="text"
                  maxLength={(seg.length || 6) + 2}
                  value={blanks[id] || ''}
                  onChange={(e) => onChange({ ...value, blanks: { ...blanks, [id]: e.target.value } })}
                  style={{ width: `${Math.max(4, (seg.length || 4) + 2)}ch` }}
                  aria-label={`Complete word ${id}`}
                  className="mx-0.5 inline-block border-b-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/50 px-1 py-0 text-center font-mono text-sm font-semibold text-indigo-900 dark:text-indigo-200 focus:outline-none"
                />
              );
            }
          )}
        </div>
      )}

      {/* 8. HIGHLIGHT INCORRECT WORDS */}
      {mechanic === 'highlight_incorrect_words' && typeof stimulus.displayTranscript === 'string' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 leading-9">
          <div className="flex flex-wrap gap-1.5">
            {stimulus.displayTranscript.split(/\s+/).map((word, idx) => {
              const selected = Array.isArray(value.selectedIndices)
                ? (value.selectedIndices as number[]).includes(idx)
                : false;
              const toggle = () => {
                const cur = Array.isArray(value.selectedIndices) ? (value.selectedIndices as number[]) : [];
                const next = selected ? cur.filter((i) => i !== idx) : [...cur, idx];
                onChange({ ...value, selectedIndices: next });
              };
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={toggle}
                  className={`rounded-md px-1.5 py-0.5 text-[15px] transition-colors ${
                    selected
                      ? 'bg-amber-200 dark:bg-amber-900/70 text-amber-950 dark:text-amber-100 font-semibold underline decoration-amber-600'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 9. WRITE FROM DICTATION / LISTEN & TYPE */}
      {mechanic === 'write_from_dictation' && (
        <textarea
          rows={3}
          value={String(value.text || '')}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="Type the exact sentence you hear..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-[15px] text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      )}

      {/* 10. DET READ AND SELECT */}
      {mechanic === 'read_and_select' && Array.isArray(stimulus.words) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {(stimulus.words as string[]).map((word) => {
            const selectedArr = Array.isArray(value.selectedWords) ? (value.selectedWords as string[]) : [];
            const active = selectedArr.includes(word);
            const toggle = () => {
              const next = active ? selectedArr.filter((w) => w !== word) : [...selectedArr, word];
              onChange({ ...value, selectedWords: next });
            };
            return (
              <button
                key={word}
                type="button"
                onClick={toggle}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-indigo-400'
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}

      {/* 11. MATCHING PAIRS (IELTS Headings / Map Labelling) */}
      {mechanic === 'matching_pairs' && Array.isArray(stimulus.pairs) && Array.isArray(stimulus.choices) && (
        <div className="space-y-3">
          {(stimulus.pairs as Array<{ key: string; prompt: string }>).map((p) => {
            const blanks = (value.blanks || {}) as Record<string, string>;
            return (
              <div
                key={p.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.key}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.prompt}</div>
                </div>
                <select
                  value={blanks[p.key] || ''}
                  onChange={(e) => onChange({ ...value, blanks: { ...blanks, [p.key]: e.target.value } })}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 sm:min-w-[260px]"
                >
                  <option value="">Select match...</option>
                  {(stimulus.choices as string[]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* Instant Objective Check Button (Practice Mode Only) */}
      {mode === 'practice' && qtSpec?.scoringMode === 'objective' && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGradeObjective}
            disabled={grading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {grading && <Loader2 className="w-4 h-4 animate-spin" />}
            Check Answer & View Explanation
          </button>
        </div>
      )}

      {gradeError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          {gradeError}
        </div>
      )}

      {/* ==================== OBJECTIVE FEEDBACK REPORT ==================== */}
      {objectiveFeedback && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {objectiveFeedback.result.isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              )}
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {objectiveFeedback.result.isCorrect ? 'Full Credit Achieved' : 'Mistake Analysis'}
              </span>
            </div>
            <span className="font-mono text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
              {objectiveFeedback.result.score} / {objectiveFeedback.result.maxScore} pts ({objectiveFeedback.result.accuracyPct}%)
            </span>
          </div>

          <p className="text-sm text-slate-700 dark:text-slate-300">{objectiveFeedback.result.mistakeSummary}</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Your Answer</th>
                  <th className="py-2 pr-3 font-medium">Verified Key</th>
                  <th className="py-2 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {objectiveFeedback.result.breakdown.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">{row.label}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{row.submitted}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{row.expected}</td>
                    <td
                      className={`py-2 text-right font-mono tabular-nums font-semibold ${
                        row.correct
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.correct ? `✓ +${row.points}` : `× ${row.points}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {objectiveFeedback.explanation && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-slate-100">Examiner Explanation: </strong>
              {objectiveFeedback.explanation}
            </div>
          )}
        </div>
      )}

      {/* ==================== AI SPEAKING FEEDBACK REPORT ==================== */}
      {speakingEval && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">AI Speaking Diagnostic Estimate</p>
              <h3 className="text-2xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                {formatExamScore(question.examCode, speakingEval.overallScore)}
              </h3>
            </div>
            <div className="flex flex-wrap gap-5 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <span>Pace: {speakingEval.metrics.wordsPerMinute} WPM</span>
              <span>Pauses: {speakingEval.metrics.pauseCount}</span>
              <span>Hesitations: {speakingEval.metrics.hesitationCount}</span>
              <span>Completeness: {speakingEval.metrics.completenessPct}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(speakingEval.subscores).map(([label, score]) => (
              <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs capitalize text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {score}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">Recognized Speech Transcript</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3.5 leading-relaxed">
              {speakingEval.transcript}
            </p>
          </div>

          {speakingEval.wordFeedback.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Word-Level Pronunciation & Accuracy Alignment
              </h4>
              <div className="flex flex-wrap gap-1.5 text-sm leading-7">
                {speakingEval.wordFeedback.map((wf, i) => (
                  <span
                    key={i}
                    title={wf.note || wf.status}
                    className={`px-1.5 py-0.5 rounded-sm ${
                      wf.status === 'correct'
                        ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
                        : wf.status === 'mispronounced'
                        ? 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 underline decoration-amber-500'
                        : 'text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 line-through'
                    }`}
                  >
                    {wf.word}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Green = Clear match · Amber underlined = Pronunciation/stress attention · Red strikethrough = Omitted/altered
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Recommended Improvements</h4>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {speakingEval.improvements.map((imp, idx) => (
                  <li key={idx}>{imp}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Suggested Practice Exercises</h4>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {speakingEval.suggestedExercises.map((ex, idx) => (
                  <li key={idx}>{ex}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {speakingEval.disclaimer}
          </p>
        </div>
      )}

      {/* ==================== AI WRITING FEEDBACK REPORT ==================== */}
      {writingEval && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">AI Writing Criterion Estimate</p>
              <h3 className="text-2xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                {formatExamScore(question.examCode, writingEval.overallScore)}
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {writingEval.wordCount} words evaluated
            </span>
          </div>

          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{writingEval.feedbackSummary}</p>

          <div className="grid sm:grid-cols-2 gap-3">
            {writingEval.criteriaScores.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{c.criterion}</span>
                  <span className="font-mono text-xs font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                    {c.score} / {c.maxScore}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{c.comment}</p>
              </div>
            ))}
          </div>

          {writingEval.grammarErrors.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Grammar, Spelling & Punctuation Corrections
              </h4>
              <div className="space-y-2">
                {writingEval.grammarErrors.map((g, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="line-through text-red-600 dark:text-red-400">{g.original}</span>
                      <span aria-hidden="true">→</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{g.correction}</span>
                      <span className="text-slate-400">· {g.category}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{g.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {writingEval.vocabularySuggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">Lexical Upgrades</h4>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {writingEval.vocabularySuggestions.map((v, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {v.original} → <span className="text-indigo-700 dark:text-indigo-400">{v.upgrade}</span>
                    </div>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">{v.contextNote}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {writingEval.improvedVersion && (
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                Improved Version of Your Response
              </h4>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                {writingEval.improvedVersion}
              </div>
            </div>
          )}

          {writingEval.modelAnswer && (
            <details className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 text-xs">
              <summary className="cursor-pointer font-semibold text-indigo-700 dark:text-indigo-400">
                View High-Scoring Original Model Answer
              </summary>
              <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                {writingEval.modelAnswer}
              </p>
            </details>
          )}

          <p className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {writingEval.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
};
