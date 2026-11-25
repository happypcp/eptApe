import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Flag,
  LayoutGrid,
  Loader2,
  Mic,
  Pause,
  Send,
  X,
} from 'lucide-react';
import { EXAM_SPECS, ExamCode, formatExamScore } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { exportReportToCSV, exportReportToExcel, exportReportToPDF } from '../lib/exporters';
import { QuestionRecord, QuestionRenderer } from './QuestionRenderer';

export interface ActiveMockSession {
  attempt: {
    id: number;
    examCode: string;
    mode: string;
    status: string;
    elapsedSec: number;
    remainingSec: number;
    currentQuestionIndex: number;
    metadataJson?: { title?: string; timed?: boolean };
  };
  questions: QuestionRecord[];
  responses: Array<{
    questionId: number;
    answerJson: Record<string, unknown>;
    isMarkedReview: boolean;
  }>;
}

interface MockTestRunnerProps {
  session: ActiveMockSession;
  candidateName: string;
  onExit: () => void;
  onCompleted: () => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const MockTestRunner: React.FC<MockTestRunnerProps> = ({
  session,
  candidateName,
  onExit,
  onCompleted,
}) => {
  const { attempt, questions } = session;
  const spec = EXAM_SPECS[attempt.examCode as ExamCode] || EXAM_SPECS.pte_academic;
  const isTimed = attempt.metadataJson?.timed !== false && attempt.remainingSec > 0;

  const [stage, setStage] = useState<'check' | 'active' | 'report'>('check');
  const [micStatus, setMicStatus] = useState<'idle' | 'ok' | 'denied'>('idle');
  const [currentIdx, setCurrentIdx] = useState(
    Math.min(attempt.currentQuestionIndex || 0, Math.max(0, questions.length - 1))
  );
  const [remainingSec, setRemainingSec] = useState(attempt.remainingSec || 1800);
  const [elapsedSec, setElapsedSec] = useState(attempt.elapsedSec || 0);
  const [answers, setAnswers] = useState<Record<number, Record<string, unknown>>>(() => {
    const init: Record<number, Record<string, unknown>> = {};
    for (const r of session.responses || []) {
      init[r.questionId] = r.answerJson || {};
    }
    return init;
  });
  const [flagged, setFlagged] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (const r of session.responses || []) {
      if (r.isMarkedReview) init[r.questionId] = true;
    }
    return init;
  });
  const [showNav, setShowNav] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<{
    summary: { overallScore: number; sectionScores: Record<string, number> };
    details: Array<{
      questionId: number;
      title: string;
      sectionCode: string;
      typeCode: string;
      scoringMode: string;
      grade?: { score: number; maxScore: number; accuracyPct: number; mistakeSummary: string };
      aiAssessment?: { overallScore: number; rawFeedbackSummary: string } | null;
      explanation: string;
    }>;
  } | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const currentQuestion = questions[currentIdx];

  const persistProgress = useCallback(
    async (
      qId: number,
      ans: Record<string, unknown>,
      isMarked: boolean,
      idx: number,
      status?: 'in_progress' | 'paused'
    ) => {
      setSaving(true);
      try {
        await apiFetch(`/api/attempts/${attempt.id}/save`, {
          method: 'PATCH',
          requireToken: true,
          body: JSON.stringify({
            currentQuestionIndex: idx,
            elapsedSec,
            remainingSec,
            status,
            response: {
              questionId: qId,
              answerJson: ans,
              isMarkedReview: isMarked,
            },
          }),
        });
      } catch {
        // Network resilience: keep local state cached in browser storage
        try {
          window.localStorage.setItem(
            `lexiscore-attempt-${attempt.id}`,
            JSON.stringify({ answers, flagged, currentIdx, elapsedSec, remainingSec })
          );
        } catch {
          // Ignore quota errors
        }
      } finally {
        setSaving(false);
      }
    },
    [attempt.id, elapsedSec, remainingSec, answers, flagged, currentIdx]
  );

  const handleSubmitMock = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (currentQuestion) {
        await persistProgress(
          currentQuestion.id,
          answers[currentQuestion.id] || {},
          Boolean(flagged[currentQuestion.id]),
          currentIdx
        );
      }
      const res = await apiFetch<{
        summary: { overallScore: number; sectionScores: Record<string, number> };
        details: Array<{
          questionId: number;
          title: string;
          sectionCode: string;
          typeCode: string;
          scoringMode: string;
          grade?: { score: number; maxScore: number; accuracyPct: number; mistakeSummary: string };
          aiAssessment?: { overallScore: number; rawFeedbackSummary: string } | null;
          explanation: string;
        }>;
      }>(`/api/attempts/${attempt.id}/submit`, {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({ elapsedSec }),
      });
      setReport(res);
      setStage('report');
      onCompleted();
    } catch (err) {
      console.error('Mock submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [attempt.id, currentQuestion, answers, flagged, currentIdx, elapsedSec, persistProgress, submitting, onCompleted]);

  // Countdown timer
  useEffect(() => {
    if (stage !== 'active') return;
    const interval = window.setInterval(() => {
      setElapsedSec((e) => e + 1);
      if (isTimed) {
        setRemainingSec((r) => {
          if (r <= 1) {
            window.clearInterval(interval);
            handleSubmitMock();
            return 0;
          }
          return r - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [stage, isTimed, handleSubmitMock]);

  const handleAnswerChange = (val: Record<string, unknown>) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: val }));
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistProgress(currentQuestion.id, val, Boolean(flagged[currentQuestion.id]), currentIdx);
    }, 900);
  };

  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    const nextFlag = !flagged[currentQuestion.id];
    setFlagged((prev) => ({ ...prev, [currentQuestion.id]: nextFlag }));
    persistProgress(currentQuestion.id, answers[currentQuestion.id] || {}, nextFlag, currentIdx);
  };

  const handlePauseAndExit = async () => {
    if (currentQuestion) {
      await persistProgress(
        currentQuestion.id,
        answers[currentQuestion.id] || {},
        Boolean(flagged[currentQuestion.id]),
        currentIdx,
        'paused'
      );
    }
    onExit();
  };

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('ok');
    } catch {
      setMicStatus('denied');
    }
  };

  // ==================== STAGE 1: HARDWARE & INSTRUCTIONS CHECK ====================
  if (stage === 'check') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">{spec.name} · {spec.versionTag}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {attempt.metadataJson?.title || `${spec.name} Mock Examination`}
              </h1>
            </div>
            <button
              onClick={onExit}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Exit mock setup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 py-4 border-y border-slate-200 dark:border-slate-800 text-sm">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Questions</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {questions.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Timing Mode</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {isTimed ? `${Math.round(remainingSec / 60)} min` : 'Untimed'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Auto-Save</div>
              <div className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Enabled (Resume Anytime)
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Microphone & Audio Check</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Verify microphone access before starting speaking sections.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {micStatus === 'ok' && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Microphone Ready</span>
              )}
              {micStatus === 'denied' && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Permission Blocked</span>
              )}
              <button
                type="button"
                onClick={testMicrophone}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Mic className="w-3.5 h-3.5" />
                Test Microphone
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{spec.disclaimer}</p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStage('active')}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 text-sm font-semibold transition-colors"
            >
              Begin Examination
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STAGE 3: DETAILED SCORE REPORT ====================
  if (stage === 'report' && report) {
    const exportPayload = {
      title: attempt.metadataJson?.title || `${spec.name} Score Report`,
      subtitle: `${spec.name} (${spec.versionTag}) · Mode: ${attempt.mode}`,
      generatedFor: candidateName,
      metrics: [
        { label: 'Estimated Overall Score', value: formatExamScore(attempt.examCode, report.summary.overallScore) },
        { label: 'Elapsed Duration', value: `${Math.max(1, Math.round(elapsedSec / 60))} minutes` },
        ...Object.entries(report.summary.sectionScores).map(([sec, sc]) => ({
          label: `${sec.charAt(0).toUpperCase() + sec.slice(1)} Section`,
          value: formatExamScore(attempt.examCode, sc),
        })),
      ],
      rows: report.details.map((d, i) => ({
        Item: i + 1,
        Section: d.sectionCode,
        Question: d.title,
        Result: d.grade
          ? `${d.grade.score}/${d.grade.maxScore} (${d.grade.accuracyPct}%)`
          : d.aiAssessment
          ? formatExamScore(attempt.examCode, d.aiAssessment.overallScore)
          : 'Submitted',
        Summary: d.grade?.mistakeSummary || d.aiAssessment?.rawFeedbackSummary || d.explanation,
      })),
      notes: spec.disclaimer,
    };

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] py-10 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                {spec.name} · Official-Style Diagnostic Report
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {attempt.metadataJson?.title || `${spec.name} Assessment Result`}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => exportReportToPDF(`lexiscore-report-${attempt.id}`, exportPayload)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <button
                onClick={() => exportReportToExcel(`lexiscore-report-${attempt.id}`, exportPayload)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
              <button
                onClick={() => exportReportToCSV(`lexiscore-report-${attempt.id}`, exportPayload.rows)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={onExit}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold"
              >
                Return to Dashboard
              </button>
            </div>
          </div>

          {/* Overall + Section Scorecards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/40 p-5">
              <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Estimated Overall</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-indigo-800 dark:text-indigo-200">
                {formatExamScore(attempt.examCode, report.summary.overallScore)}
              </div>
            </div>
            {Object.entries(report.summary.sectionScores).map(([sec, sc]) => (
              <div key={sec} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="text-xs capitalize text-slate-500 dark:text-slate-400">{sec}</div>
                <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatExamScore(attempt.examCode, sc)}
                </div>
              </div>
            ))}
          </div>

          {/* Item-by-Item Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {report.details.map((d, idx) => (
              <div key={d.questionId} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Q{idx + 1} · <span className="capitalize">{d.sectionCode}</span> · {d.typeCode}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {d.grade?.mistakeSummary || d.aiAssessment?.rawFeedbackSummary || d.explanation}
                  </p>
                </div>
                <div className="shrink-0 font-mono text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                  {d.grade
                    ? `${d.grade.score} / ${d.grade.maxScore} (${d.grade.accuracyPct}%)`
                    : d.aiAssessment
                    ? formatExamScore(attempt.examCode, d.aiAssessment.overallScore)
                    : 'Recorded'}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">{spec.disclaimer}</p>
        </div>
      </div>
    );
  }

  // ==================== STAGE 2: DISTRACTION-FREE EXAM SIMULATOR ====================
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col">
      {/* Exam Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-sm text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
            LexiScore CBT
          </span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
            {attempt.metadataJson?.title || spec.name}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs text-slate-400">
            {saving ? 'Saving...' : 'Auto-saved'}
          </span>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            {isTimed ? formatClock(remainingSec) : formatClock(elapsedSec)}
          </div>

          <button
            type="button"
            onClick={() => setShowNav((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {currentIdx + 1} / {questions.length}
          </button>

          <button
            type="button"
            onClick={handlePauseAndExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Pause className="w-3.5 h-3.5" />
            Save & Pause
          </button>
        </div>
      </header>

      {/* Main Question Stage */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        {currentQuestion && (
          <QuestionRenderer
            question={currentQuestion}
            mode="mock"
            attemptId={attempt.id}
            value={answers[currentQuestion.id] || {}}
            onChange={handleAnswerChange}
            isAuthenticated={true}
          />
        )}
      </div>

      {/* Bottom Exam Control Bar */}
      <footer className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleToggleFlag}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
              currentQuestion && flagged[currentQuestion.id]
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            {currentQuestion && flagged[currentQuestion.id] ? 'Marked for Review' : 'Mark for Review'}
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Previous
            </button>
            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 text-xs font-semibold"
              >
                Next Question
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitMock}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Submit Examination
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Question Navigator Drawer */}
      {showNav && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/50" onClick={() => setShowNav(false)}>
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 overflow-y-auto flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Question Navigator</h3>
                <button onClick={() => setShowNav(false)} className="p-1 text-slate-500 hover:text-slate-900">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const hasAns = answers[q.id] && Object.keys(answers[q.id]).length > 0;
                  const isFlagged = Boolean(flagged[q.id]);
                  const isCur = idx === currentIdx;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setCurrentIdx(idx);
                        setShowNav(false);
                      }}
                      className={`relative h-10 rounded-lg border font-mono text-xs font-semibold tabular-nums transition-colors ${
                        isCur
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : hasAns
                          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {idx + 1}
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500" title="Flagged" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Answered
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-amber-500" /> Flagged
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitMock}
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Finish & Score Exam Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
