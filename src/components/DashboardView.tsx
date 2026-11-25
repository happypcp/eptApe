import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Calendar,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { EXAM_LIST, EXAM_SPECS, ExamCode, formatExamScore } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { exportReportToCSV, exportReportToExcel, exportReportToPDF } from '../lib/exporters';
import { useAuth } from '../context/AuthContext';
import { ActiveMockSession } from './MockTestRunner';

interface StudentAnalyticsPayload {
  summary: {
    totalPracticeMinutes: number;
    testsCompleted: number;
    aiEvaluationsCount: number;
    averageScore: number | null;
    highestScore: number | null;
    accuracyPct: number | null;
  };
  skillPerformance: Array<{ skill: string; score: number; sampleCount: number }>;
  weakestTypes: Array<{ typeCode: string; accuracyPct: number; attempts: number }>;
  trendSeries: Array<{ date: string; score: number; label: string }>;
  recentAttempts: Array<{
    id: number;
    examCode: string;
    mode: string;
    status: string;
    overallScore: number | null;
    elapsedSec: number;
    startedAt: string;
    completedAt: string | null;
    metadataJson?: { title?: string };
  }>;
  recentAssessments: Array<{
    id: number;
    examCode: string;
    assessmentType: string;
    overallScore: number;
    rawFeedbackSummary: string;
    createdAt: string;
  }>;
}

interface StudyPlanRecord {
  id: number;
  examCode: string;
  targetScore: string;
  currentEstimatedScore: string;
  examDate: string | null;
  weeklyHours: number;
  planJson: {
    headline?: string;
    readinessAssessment?: string;
    weeklyMilestones?: Array<{ week: number; focus: string; mockTarget: string }>;
    dailySchedule?: Array<{
      day: string;
      minutes: number;
      tasks: Array<{ skill: string; taskType: string; count: number; goal: string }>;
    }>;
  };
  createdAt: string;
}

interface DashboardViewProps {
  selectedExam: ExamCode;
  onSelectExam: (code: ExamCode) => void;
  onNavigate: (tab: 'practice' | 'tutor' | 'teams' | 'billing' | 'settings') => void;
  onResumeMock: (session: ActiveMockSession) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  selectedExam,
  onSelectExam,
  onNavigate,
  onResumeMock,
}) => {
  const { account, profile } = useAuth();
  const [analytics, setAnalytics] = useState<StudentAnalyticsPayload | null>(null);
  const [studyPlans, setStudyPlans] = useState<StudyPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<number | null>(null);

  // Study Plan Generator Form
  const [planTarget, setPlanTarget] = useState(profile?.targetScore || '79');
  const [planHours, setPlanHours] = useState(profile?.weeklyHours || 10);
  const [planDate, setPlanDate] = useState(profile?.examDate || '');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const spec = EXAM_SPECS[selectedExam] || EXAM_SPECS.pte_academic;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [anData, spData] = await Promise.all([
        apiFetch<StudentAnalyticsPayload>(`/api/analytics/student?exam=${selectedExam}`, { requireToken: true }),
        apiFetch<{ studyPlans: StudyPlanRecord[] }>('/api/ai/study-plan', { requireToken: true }),
      ]);
      setAnalytics(anData);
      setStudyPlans(spData.studyPlans || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard analytics.');
    } finally {
      setLoading(false);
    }
  }, [selectedExam]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (profile?.targetScore) setPlanTarget(profile.targetScore);
    if (profile?.weeklyHours) setPlanHours(profile.weeklyHours);
    if (profile?.examDate) setPlanDate(profile.examDate);
  }, [profile]);

  const handleResumeAttempt = async (attemptId: number) => {
    setResumingId(attemptId);
    try {
      const data = await apiFetch<ActiveMockSession>(`/api/attempts/${attemptId}`, { requireToken: true });
      onResumeMock(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resume saved attempt.');
    } finally {
      setResumingId(null);
    }
  };

  const handleGenerateStudyPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingPlan(true);
    setPlanError(null);
    try {
      const currentScoreLabel =
        analytics?.summary.averageScore !== null && analytics?.summary.averageScore !== undefined
          ? formatExamScore(selectedExam, analytics.summary.averageScore)
          : 'Unbenchmarked';
      const weakAreas = (analytics?.weakestTypes || []).map((w) => w.typeCode);

      const res = await apiFetch<{ studyPlan: StudyPlanRecord }>('/api/ai/study-plan', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          examCode: selectedExam,
          targetScore: planTarget.trim() || String(spec.scoreScaleMax),
          currentEstimatedScore: currentScoreLabel,
          examDate: planDate || undefined,
          weeklyHours: Number(planHours) || 10,
          weakAreas,
        }),
      });
      setStudyPlans((prev) => [res.studyPlan, ...prev]);
    } catch (err: unknown) {
      setPlanError(err instanceof Error ? err.message : 'Failed to generate study plan.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const buildExportPayload = () => {
    const s = analytics?.summary;
    return {
      title: `${spec.name} Candidate Performance Report`,
      subtitle: `${spec.providerLabel} · ${spec.versionTag}`,
      generatedFor: account?.fullName || account?.email || 'Candidate',
      metrics: [
        {
          label: 'Average Estimated Score',
          value: s?.averageScore !== null && s?.averageScore !== undefined ? formatExamScore(selectedExam, s.averageScore) : '—',
        },
        {
          label: 'Highest Score Recorded',
          value: s?.highestScore !== null && s?.highestScore !== undefined ? formatExamScore(selectedExam, s.highestScore) : '—',
        },
        { label: 'Completed Mock & Practice Tests', value: String(s?.testsCompleted || 0) },
        { label: 'AI Speaking & Writing Evaluations', value: String(s?.aiEvaluationsCount || 0) },
        { label: 'Objective Question Accuracy', value: s?.accuracyPct !== null && s?.accuracyPct !== undefined ? `${s.accuracyPct}%` : '—' },
        { label: 'Total Study Duration', value: `${s?.totalPracticeMinutes || 0} minutes` },
      ],
      rows: (analytics?.recentAttempts || []).map((a) => ({
        AttemptID: a.id,
        Exam: EXAM_SPECS[a.examCode as ExamCode]?.shortName || a.examCode,
        Title: a.metadataJson?.title || a.mode,
        Status: a.status,
        Score: a.overallScore !== null ? formatExamScore(a.examCode, a.overallScore) : 'In Progress',
        Minutes: Math.max(1, Math.round((a.elapsedSec || 0) / 60)),
        Date: new Date(a.startedAt).toLocaleDateString(),
      })),
      notes: spec.disclaimer,
    };
  };

  const inProgressAttempts = (analytics?.recentAttempts || []).filter(
    (a) => a.status === 'in_progress' || a.status === 'paused'
  );
  const activePlan = studyPlans.find((p) => p.examCode === selectedExam) || studyPlans[0] || null;

  return (
    <div className="space-y-6">
      {/* Header & Exam Filter */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Performance Analytics · {spec.name} ({spec.versionTag})
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {account?.fullName?.split(' ')[0] || 'Scholar'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedExam}
            onChange={(e) => onSelectExam(e.target.value as ExamCode)}
            aria-label="Filter analytics by exam"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {EXAM_LIST.map((ex) => (
              <option key={ex.code} value={ex.code}>
                {ex.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => exportReportToPDF(`lexiscore-analytics-${selectedExam}`, buildExportPayload())}
            disabled={!analytics}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            type="button"
            onClick={() => exportReportToExcel(`lexiscore-analytics-${selectedExam}`, buildExportPayload())}
            disabled={!analytics}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            type="button"
            onClick={() => exportReportToCSV(`lexiscore-analytics-${selectedExam}`, buildExportPayload().rows)}
            disabled={!analytics || (analytics.recentAttempts?.length || 0) === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={loadDashboard}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label="Refresh analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Resumable Paused / In-Progress Mocks */}
      {inProgressAttempts.length > 0 && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Saved Examination Sessions</p>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                Resume where you paused with auto-saved answers intact
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {inProgressAttempts.slice(0, 3).map((att) => (
                <button
                  key={att.id}
                  type="button"
                  disabled={resumingId === att.id}
                  onClick={() => handleResumeAttempt(att.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {resumingId === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Resume: {att.metadataJson?.title || `${EXAM_SPECS[att.examCode as ExamCode]?.shortName} Mock`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Estimated Average</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {analytics?.summary.averageScore !== null && analytics?.summary.averageScore !== undefined
              ? formatExamScore(selectedExam, analytics.summary.averageScore)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Target: <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">{profile?.targetScore || spec.scoreScaleMax}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Highest Benchmark</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {analytics?.summary.highestScore !== null && analytics?.summary.highestScore !== undefined
              ? formatExamScore(selectedExam, analytics.summary.highestScore)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Scale {spec.scoreScaleMin}–{spec.scoreScaleMax} {spec.scoreUnit}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Objective Accuracy</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {analytics?.summary.accuracyPct !== null && analytics?.summary.accuracyPct !== undefined
              ? `${analytics.summary.accuracyPct}%`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {analytics?.summary.testsCompleted || 0} completed · {analytics?.summary.aiEvaluationsCount || 0} AI scored
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Focused Practice Time</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {analytics?.summary.totalPracticeMinutes || 0}
            <span className="text-xs font-sans font-normal text-slate-500 ml-1">min</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Goal: {profile?.weeklyHours || 10} hrs / week
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* 4-Skill Bar Breakdown */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">4-Skill Diagnostic Profile</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Average performance across Speaking, Writing, Reading &amp; Listening</p>
            </div>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.skillPerformance || []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                <XAxis dataKey="skill" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, spec.scoreScaleMax]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="score" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Score Progression Trend */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Score Trajectory</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chronological trend across completed mocks and AI speaking/writing tasks</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('practice')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:underline"
            >
              Launch Practice <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {analytics && analytics.trendSeries.length > 0 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.trendSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[spec.scoreScaleMin, spec.scoreScaleMax]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} fill="url(#scoreGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-6">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No benchmark attempts recorded yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                Complete any practice question, AI speaking/writing evaluation, or timed mock exam to populate your score trajectory.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('practice')}
                className="mt-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold"
              >
                Open Practice &amp; Mock Hub
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Weakest Question Types + Recent Attempts Table */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Priority Remediation Areas</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Lowest accuracy objective task types</p>
          <div className="mt-4 space-y-3">
            {analytics && analytics.weakestTypes.length > 0 ? (
              analytics.weakestTypes.map((w) => (
                <div key={w.typeCode} className="pb-3 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{w.typeCode}</span>
                    <span className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {w.accuracyPct}% · {w.attempts} tries
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${Math.max(4, w.accuracyPct)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                Practice reading or listening objective items to automatically identify high-leverage weaknesses.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Attempts &amp; AI Evaluations</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="pb-2.5 font-medium">Session</th>
                  <th className="pb-2.5 font-medium">Mode</th>
                  <th className="pb-2.5 font-medium">Status</th>
                  <th className="pb-2.5 font-medium text-right">Est. Score</th>
                  <th className="pb-2.5 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(analytics?.recentAttempts || []).slice(0, 6).map((a) => (
                  <tr key={a.id} className="text-slate-700 dark:text-slate-300">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {a.metadataJson?.title || EXAM_SPECS[a.examCode as ExamCode]?.name || a.examCode}
                    </td>
                    <td className="py-2.5 capitalize">{a.mode.replace('_', ' ')}</td>
                    <td className="py-2.5 capitalize">{a.status.replace('_', ' ')}</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-indigo-700 dark:text-indigo-400">
                      {a.overallScore !== null ? formatExamScore(a.examCode, a.overallScore) : '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-500">
                      {new Date(a.startedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(analytics?.recentAssessments || []).slice(0, 4).map((ai) => (
                  <tr key={`ai-${ai.id}`} className="text-slate-700 dark:text-slate-300">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      AI {ai.assessmentType.charAt(0).toUpperCase() + ai.assessmentType.slice(1)} Diagnostic
                    </td>
                    <td className="py-2.5">AI Scoring</td>
                    <td className="py-2.5">Scored</td>
                    <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatExamScore(ai.examCode, ai.overallScore)}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-500">
                      {new Date(ai.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(!analytics || (analytics.recentAttempts.length === 0 && analytics.recentAssessments.length === 0)) && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                      No attempts recorded for {spec.name} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Personalized AI Study Plan Generator */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" /> Personalized AI Study Planner
            </div>
            <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              Generate a calibrated weekly drill schedule for {spec.name}
            </h2>
          </div>

          <form onSubmit={handleGenerateStudyPlan} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <Target className="w-3 h-3 inline mr-1" /> Target Score
              </label>
              <input
                type="text"
                value={planTarget}
                onChange={(e) => setPlanTarget(e.target.value)}
                placeholder={String(spec.scoreScaleMax)}
                className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Hrs / Week
              </label>
              <input
                type="number"
                min={2}
                max={60}
                value={planHours}
                onChange={(e) => setPlanHours(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" /> Exam Date
              </label>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={generatingPlan}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {generatingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generatingPlan ? 'Building Plan...' : 'Generate AI Study Plan'}
            </button>
          </form>
        </div>

        {planError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{planError}</p>}

        {activePlan ? (
          <div className="mt-5 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {activePlan.planJson?.headline || `${EXAM_SPECS[activePlan.examCode as ExamCode]?.name} Study Plan`}
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {activePlan.planJson?.readinessAssessment}
              </p>
            </div>

            {Array.isArray(activePlan.planJson?.weeklyMilestones) && activePlan.planJson.weeklyMilestones.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {activePlan.planJson.weeklyMilestones.map((m) => (
                  <div key={m.week} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3.5">
                    <div className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400">Week {m.week}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{m.focus}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Target: {m.mockTarget}</div>
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(activePlan.planJson?.dailySchedule) && activePlan.planJson.dailySchedule.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activePlan.planJson.dailySchedule.slice(0, 6).map((d) => (
                  <div key={d.day} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-100">
                      <span>{d.day}</span>
                      <span className="font-mono text-slate-500">{d.minutes} min</span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {(d.tasks || []).map((t, i) => (
                        <li key={i}>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{t.taskType}</span> ({t.count}×) — {t.goal}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Set your target score and weekly study hours above to generate a tailored day-by-day preparation roadmap stored in your account.
          </p>
        )}
      </div>
    </div>
  );
};
