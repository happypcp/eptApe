import React, { useEffect, useState } from 'react';
import { Camera, Download, Loader2, Save, Trash2 } from 'lucide-react';
import { EXAM_LIST, ExamCode } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../hooks/usePWA';

export const SettingsView: React.FC = () => {
  const { account, profile, refreshAccount, logout } = useAuth();

  const [fullName, setFullName] = useState(account?.fullName || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account?.avatarUrl || null);
  const [targetExam, setTargetExam] = useState<ExamCode>((profile?.targetExam as ExamCode) || 'pte_academic');
  const [targetScore, setTargetScore] = useState(profile?.targetScore || '79');
  const [examDate, setExamDate] = useState(profile?.examDate || '');
  const [weeklyHours, setWeeklyHours] = useState(profile?.weeklyHours || 10);
  const [nativeLanguage, setNativeLanguage] = useState(profile?.nativeLanguage || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [notifPrefs, setNotifPrefs] = useState({
    email: profile?.notificationPrefsJson?.email ?? true,
    inApp: profile?.notificationPrefsJson?.inApp ?? true,
    studyReminders: profile?.notificationPrefsJson?.studyReminders ?? true,
    aiCompleted: profile?.notificationPrefsJson?.aiCompleted ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (account) {
      setFullName(account.fullName);
      setAvatarUrl(account.avatarUrl);
    }
    if (profile) {
      setTargetExam((profile.targetExam as ExamCode) || 'pte_academic');
      setTargetScore(profile.targetScore || '79');
      setExamDate(profile.examDate || '');
      setWeeklyHours(profile.weeklyHours || 10);
      setNativeLanguage(profile.nativeLanguage || '');
      setBio(profile.bio || '');
      if (profile.notificationPrefsJson) {
        setNotifPrefs(profile.notificationPrefsJson);
      }
    }
  }, [account, profile]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 192;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        setAvatarUrl(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        requireToken: true,
        body: JSON.stringify({
          fullName: fullName.trim(),
          avatarUrl,
          targetExam,
          targetScore: targetScore.trim(),
          examDate: examDate || null,
          weeklyHours: Number(weeklyHours) || 10,
          nativeLanguage: nativeLanguage.trim(),
          bio: bio.trim(),
          notificationPrefsJson: notifPrefs,
        }),
      });
      await refreshAccount();
      setNotice({ type: 'ok', text: 'Profile, target exam goals, and notification preferences saved.' });
    } catch (err: unknown) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDataExport = async () => {
    setExporting(true);
    try {
      const data = await apiFetch<Record<string, unknown>>('/api/me/export', { requireToken: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lexiscore-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'Failed to export data.' });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE', requireToken: true });
      await logout();
    } catch (err: unknown) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'Account deletion failed.' });
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Account · Study Goals · Notifications · Privacy &amp; GDPR Data Portability
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
          Account &amp; Study Settings
        </h1>
      </div>

      {notice && (
        <div
          className={`rounded-xl border p-4 text-xs ${
            notice.type === 'ok'
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
              : 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      <form
        onSubmit={handleSaveProfile}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
      >
        {/* Profile Photo & Identity */}
        <div className="flex flex-wrap items-center gap-5 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="relative w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-xl font-bold text-indigo-700 dark:text-indigo-300">
                {(fullName || account?.email || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">{account?.email}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
              Role: {account?.role.replace('_', ' ')} · {account?.emailVerified ? 'Email Verified' : 'Unverified Email'}
            </div>
            <label className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <Camera className="w-3.5 h-3.5" />
              Upload Photo
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Native Language</label>
            <input
              type="text"
              value={nativeLanguage}
              onChange={(e) => setNativeLanguage(e.target.value)}
              placeholder="Nepali, Mandarin, Hindi, Spanish..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Primary Target Exam</label>
            <select
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value as ExamCode)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
            >
              {EXAM_LIST.map((ex) => (
                <option key={ex.code} value={ex.code}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Target Score / Band</label>
            <input
              type="text"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              placeholder="e.g. 79+, Band 8.0, 130"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Scheduled Exam Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Weekly Study Commitment (Hours)</label>
            <input
              type="number"
              min={1}
              max={80}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="text-xs">
          <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Study Notes / Academic Goal</label>
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Preparing for postgraduate engineering admissions..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
          />
        </div>

        {/* Notification Preferences */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white">Notification Preferences</h2>
          <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
            {[
              { key: 'inApp', label: 'In-app score & mock completion alerts' },
              { key: 'email', label: 'Email progress summaries & receipts' },
              { key: 'studyReminders', label: 'Daily study plan reminders' },
              { key: 'aiCompleted', label: 'AI speaking/writing evaluation notices' },
            ].map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifPrefs[item.key as keyof typeof notifPrefs]}
                  onChange={(e) =>
                    setNotifPrefs((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <PWAInstallButton />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Account Settings
          </button>
        </div>
      </form>

      {/* Privacy, Data Export & Deletion */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Data Portability &amp; Account Lifecycle</h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Export Personal Learning Data (JSON)</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Download all mock attempts, AI speaking/writing diagnostics, study plans, and profile settings.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={handleDataExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export JSON
          </button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-red-700 dark:text-red-400">Delete Account</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Deactivate your LexiScore account and end your active session.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900 px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Request Account Deletion
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
