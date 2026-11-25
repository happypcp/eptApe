import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Loader2,
  Plus,
  Shield,
  Upload,
} from 'lucide-react';
import { EXAM_LIST, EXAM_SPECS, ExamCode } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { exportReportToExcel, exportReportToPDF } from '../lib/exporters';
import { QuestionRecord } from './QuestionRenderer';
import { useAuth } from '../context/AuthContext';

interface AdminOverviewData {
  stats: {
    totalUsers: number;
    totalQuestions: number;
    totalAttempts: number;
    totalAiEvaluations: number;
    totalOrganizations: number;
    verifiedRevenueUsd: number;
  };
  users: Array<{
    id: number;
    email: string;
    fullName: string;
    role: string;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: number;
    action: string;
    targetEntity: string;
    targetId: string;
    createdAt: string;
  }>;
  coupons: Array<{
    id: number;
    code: string;
    discountType: string;
    discountValue: number;
    redeemedCount: number;
    maxRedemptions: number;
  }>;
}

const ROLES = ['student', 'team_manager', 'teacher', 'org_owner', 'admin', 'super_admin'] as const;

export const AdminView: React.FC = () => {
  const { account } = useAuth();
  const [tab, setTab] = useState<'overview' | 'cms' | 'import' | 'users' | 'coupons'>('overview');
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [cmsQuestions, setCmsQuestions] = useState<QuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create Question Form
  const [qExam, setQExam] = useState<ExamCode>('pte_academic');
  const [qSection, setQSection] = useState<'speaking' | 'writing' | 'reading' | 'listening' | 'adaptive'>('reading');
  const [qType, setQType] = useState('r_mcs');
  const [qTitle, setQTitle] = useState('');
  const [qTopic, setQTopic] = useState('Academic Research');
  const [qDiff, setQDiff] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [qPrompt, setQPrompt] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qStatus, setQStatus] = useState<'draft' | 'review' | 'published'>('published');
  const [savingQ, setSavingQ] = useState(false);

  // Bulk JSON/CSV Import
  const [bulkText, setBulkText] = useState('');
  const [importing, setImporting] = useState(false);

  // Coupon Creator
  const [couponCode, setCouponCode] = useState('');
  const [couponVal, setCouponVal] = useState(20);
  const [couponMax, setCouponMax] = useState(200);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, qs] = await Promise.all([
        apiFetch<AdminOverviewData>('/api/admin/overview', { requireToken: true }),
        apiFetch<{ questions: QuestionRecord[] }>('/api/questions?includeAll=true', { requireToken: true }),
      ]);
      setOverview(ov);
      setCmsQuestions(qs.questions || []);
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Admin access required.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleRoleChange = async (userId: number, role: string) => {
    setMessage(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        requireToken: true,
        body: JSON.stringify({ role }),
      });
      setMessage({ type: 'ok', text: `Updated user #${userId} role to ${role}.` });
      await loadAdminData();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Role update failed.' });
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQ(true);
    setMessage(null);
    try {
      await apiFetch('/api/admin/questions', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          examCode: qExam,
          sectionCode: qSection,
          typeCode: qType,
          title: qTitle.trim(),
          difficulty: qDiff,
          topic: qTopic.trim(),
          promptText: qPrompt.trim(),
          explanation: qExplanation.trim(),
          status: qStatus,
          stimulusJson: { passage: qPrompt.trim() },
          answerKeyJson: {},
        }),
      });
      setQTitle('');
      setQPrompt('');
      setQExplanation('');
      setMessage({ type: 'ok', text: 'Question authored and persisted to PostgreSQL.' });
      await loadAdminData();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save question.' });
    } finally {
      setSavingQ(false);
    }
  };

  const handleQuestionStatusChange = async (id: number, status: 'draft' | 'review' | 'published' | 'archived') => {
    try {
      await apiFetch(`/api/admin/questions/${id}`, {
        method: 'PATCH',
        requireToken: true,
        body: JSON.stringify({ status }),
      });
      await loadAdminData();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Status update failed.' });
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setMessage(null);
    try {
      const trimmed = bulkText.trim();
      let items: Array<Record<string, unknown>> = [];
      if (trimmed.startsWith('[')) {
        items = JSON.parse(trimmed);
      } else {
        // Parse CSV: examCode,sectionCode,typeCode,title,difficulty,topic,promptText
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        const startIdx = lines[0]?.toLowerCase().includes('examcode') ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 7) {
            items.push({
              examCode: cols[0],
              sectionCode: cols[1],
              typeCode: cols[2],
              title: cols[3],
              difficulty: cols[4] || 'medium',
              topic: cols[5] || 'General',
              promptText: cols.slice(6).join(', '),
              status: 'published',
            });
          }
        }
      }
      if (!items.length) throw new Error('No valid JSON array or CSV rows detected.');
      const res = await apiFetch<{ importedCount: number; duplicateCount: number }>('/api/admin/questions/bulk-import', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({ items }),
      });
      setMessage({
        type: 'ok',
        text: `Imported ${res.importedCount} new questions (${res.duplicateCount} duplicates skipped).`,
      });
      setBulkText('');
      await loadAdminData();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Bulk import failed.' });
    } finally {
      setImporting(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await apiFetch('/api/admin/coupons', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          discountType: 'percent',
          discountValue: Number(couponVal),
          maxRedemptions: Number(couponMax),
        }),
      });
      setCouponCode('');
      setMessage({ type: 'ok', text: 'Promo coupon created.' });
      await loadAdminData();
    } catch (err: unknown) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Coupon creation failed.' });
    }
  };

  const exportAdminSummary = (format: 'pdf' | 'excel') => {
    if (!overview) return;
    const payload = {
      title: 'LexiScore Executive Platform & CMS Audit Report',
      subtitle: 'Multi-Exam SaaS Operations Summary',
      generatedFor: account?.fullName || 'Administrator',
      metrics: [
        { label: 'Total Registered Accounts', value: String(overview.stats.totalUsers) },
        { label: 'Authored Question Bank Items', value: String(overview.stats.totalQuestions) },
        { label: 'Recorded Test Attempts', value: String(overview.stats.totalAttempts) },
        { label: 'AI Speaking & Writing Evaluations', value: String(overview.stats.totalAiEvaluations) },
        { label: 'Organizations', value: String(overview.stats.totalOrganizations) },
        { label: 'Verified Revenue (USD)', value: `$${overview.stats.verifiedRevenueUsd.toFixed(2)}` },
      ],
      rows: overview.users.map((u) => ({
        UserID: u.id,
        Name: u.fullName,
        Email: u.email,
        Role: u.role,
        Joined: new Date(u.createdAt).toLocaleDateString(),
      })),
    };
    if (format === 'pdf') exportReportToPDF('lexiscore-admin-report', payload);
    else exportReportToExcel('lexiscore-admin-report', payload);
  };

  const examTypesForForm = EXAM_SPECS[qExam]?.questionTypes || [];

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading administration console...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Role-Gated Operations Console ({account?.role})
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
            Administration &amp; Question Bank CMS
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportAdminSummary('pdf')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Admin PDF
          </button>
          <button
            type="button"
            onClick={() => exportAdminSummary('excel')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Admin Excel
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-3.5 text-xs ${
            message.type === 'ok'
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
              : 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'overview', label: 'Platform Overview & Audit' },
          { id: 'cms', label: `Question Bank CMS (${cmsQuestions.length})` },
          { id: 'import', label: 'Bulk CSV / JSON Import' },
          { id: 'users', label: `Users & RBAC (${overview?.users.length || 0})` },
          { id: 'coupons', label: `Coupons (${overview?.coupons.length || 0})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ==================== OVERVIEW TAB ==================== */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: 'Users', value: overview.stats.totalUsers },
              { label: 'Questions', value: overview.stats.totalQuestions },
              { label: 'Attempts', value: overview.stats.totalAttempts },
              { label: 'AI Scored', value: overview.stats.totalAiEvaluations },
              { label: 'Organizations', value: overview.stats.totalOrganizations },
              { label: 'Verified Rev', value: `$${overview.stats.verifiedRevenueUsd}` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs text-slate-500">{s.label}</div>
                <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Security &amp; Operations Audit Trail</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {overview.auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">{log.action}</span>
                    <span className="ml-2 text-slate-500">
                      {log.targetEntity} #{log.targetId}
                    </span>
                  </div>
                  <span className="font-mono text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {overview.auditLogs.length === 0 && (
                <p className="py-4 text-slate-500">No audit events recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== QUESTION BANK CMS TAB ==================== */}
      {tab === 'cms' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateQuestion}
            className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
              <Plus className="w-4 h-4 text-indigo-600" /> Author Original Question
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Exam</label>
                <select
                  value={qExam}
                  onChange={(e) => {
                    const ex = e.target.value as ExamCode;
                    setQExam(ex);
                    const first = EXAM_SPECS[ex]?.questionTypes[0];
                    if (first) {
                      setQSection(first.sectionCode as typeof qSection);
                      setQType(first.code);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                >
                  {EXAM_LIST.map((ex) => (
                    <option key={ex.code} value={ex.code}>
                      {ex.shortName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Task Type</label>
                <select
                  value={qType}
                  onChange={(e) => {
                    const code = e.target.value;
                    setQType(code);
                    const found = examTypesForForm.find((t) => t.code === code);
                    if (found) setQSection(found.sectionCode as typeof qSection);
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                >
                  {examTypesForForm.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <input
              type="text"
              required
              value={qTitle}
              onChange={(e) => setQTitle(e.target.value)}
              placeholder="Question Title"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={qTopic}
                onChange={(e) => setQTopic(e.target.value)}
                placeholder="Topic"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={qDiff}
                onChange={(e) => setQDiff(e.target.value as 'easy' | 'medium' | 'hard')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <select
                value={qStatus}
                onChange={(e) => setQStatus(e.target.value as 'draft' | 'review' | 'published')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              >
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="published">Published</option>
              </select>
            </div>
            <textarea
              required
              rows={4}
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              placeholder="Full question prompt & instructions..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <textarea
              rows={2}
              value={qExplanation}
              onChange={(e) => setQExplanation(e.target.value)}
              placeholder="Scoring explanation / rubric guidance..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={savingQ}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-xs font-semibold disabled:opacity-50"
            >
              {savingQ ? 'Saving...' : 'Save to Question Bank'}
            </button>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              Question Bank Lifecycle &amp; Publishing Queue
            </h2>
            <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {cmsQuestions.map((q) => (
                <div key={q.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{q.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {q.examCode} · {q.sectionCode} · {q.typeCode} · {q.difficulty}
                    </div>
                  </div>
                  <select
                    value={q.status || 'published'}
                    onChange={(e) =>
                      handleQuestionStatusChange(q.id, e.target.value as 'draft' | 'review' | 'published' | 'archived')
                    }
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== BULK IMPORT TAB ==================== */}
      {tab === 'import' && (
        <form
          onSubmit={handleBulkImport}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Upload className="w-4 h-4 text-indigo-600" /> Bulk Question Bank Importer (JSON Array or CSV with Duplicate Detection)
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Paste a JSON array of question objects or CSV lines formatted as:{' '}
            <code className="font-mono text-indigo-700 dark:text-indigo-400">
              examCode,sectionCode,typeCode,title,difficulty,topic,promptText
            </code>
          </p>
          <textarea
            rows={8}
            required
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`examCode,sectionCode,typeCode,title,difficulty,topic,promptText\npte_academic,speaking,s_ra,Solar Microgrids Overview,medium,Energy,Read the following academic passage aloud clearly within 40 seconds.`}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={importing}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            {importing ? 'Validating & Importing...' : 'Run Bulk Import'}
          </button>
        </form>
      )}

      {/* ==================== USERS & RBAC TAB ==================== */}
      {tab === 'users' && overview && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="pb-2.5 font-medium">User</th>
                <th className="pb-2.5 font-medium">Email</th>
                <th className="pb-2.5 font-medium">Joined</th>
                <th className="pb-2.5 font-medium text-right">RBAC Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {overview.users.map((u) => (
                <tr key={u.id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-3 font-semibold text-slate-900 dark:text-white">{u.fullName}</td>
                  <td className="py-3 font-mono">{u.email}</td>
                  <td className="py-3 font-mono text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 text-right">
                    <select
                      value={u.role}
                      disabled={!['super_admin', 'admin'].includes(account?.role || '')}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== COUPONS TAB ==================== */}
      {tab === 'coupons' && overview && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateCoupon}
            className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Create Discount Coupon</h2>
            <input
              type="text"
              required
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="SPRING30"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Percent Off (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={couponVal}
                  onChange={(e) => setCouponVal(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Max Uses</label>
                <input
                  type="number"
                  min={1}
                  value={couponMax}
                  onChange={(e) => setCouponMax(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-xs font-semibold"
            >
              Create Coupon
            </button>
          </form>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Active Promotional Codes</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {overview.coupons.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{c.code}</span>
                    <span className="ml-2 text-slate-600 dark:text-slate-400">
                      {c.discountType === 'percent' ? `${c.discountValue}% off` : `$${c.discountValue} off`}
                    </span>
                  </div>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {c.redeemedCount} / {c.maxRedemptions} redeemed
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
