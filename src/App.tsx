/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EXAM_LIST, EXAM_SPECS, ExamCode } from './shared/examSpecs';
import { OfflineIndicator, PWAInstallButton } from './hooks/usePWA';
import { PublicLanding } from './components/PublicLanding';
import { DashboardView } from './components/DashboardView';
import { PracticeHubView } from './components/PracticeHubView';
import { TutorView } from './components/TutorView';
import { TeamsView } from './components/TeamsView';
import { BillingView } from './components/BillingView';
import { AdminView } from './components/AdminView';
import { SettingsView } from './components/SettingsView';
import { ActiveMockSession, MockTestRunner } from './components/MockTestRunner';

type WorkspaceTab = 'dashboard' | 'practice' | 'tutor' | 'teams' | 'billing' | 'admin' | 'settings';

const LexiScoreShell: React.FC = () => {
  const {
    account,
    profile,
    notifications,
    loading,
    darkMode,
    toggleDarkMode,
    loginWithGoogle,
    logout,
    markAllNotificationsRead,
    refreshAccount,
  } = useAuth();

  const [guestPracticeMode, setGuestPracticeMode] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [selectedExam, setSelectedExam] = useState<ExamCode>('pte_academic');
  const [activeMock, setActiveMock] = useState<ActiveMockSession | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Sync user's preferred target exam once profile loads
  useEffect(() => {
    if (profile?.targetExam && EXAM_SPECS[profile.targetExam as ExamCode]) {
      setSelectedExam(profile.targetExam as ExamCode);
    }
  }, [profile?.targetExam]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const canAccessAdmin = Boolean(
    account && ['super_admin', 'admin', 'org_owner', 'teacher', 'team_manager'].includes(account.role)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Initializing LexiScore Workspace...</p>
      </div>
    );
  }

  // Full-screen distraction-free CBT Mock Simulator takeover
  if (activeMock && account) {
    return (
      <MockTestRunner
        session={activeMock}
        candidateName={account.fullName || account.email}
        onExit={() => {
          setActiveMock(null);
          refreshAccount();
        }}
        onCompleted={() => {
          refreshAccount();
        }}
      />
    );
  }

  // Unauthenticated Guest View (Landing or Guest Practice Preview)
  if (!account) {
    if (guestPracticeMode) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
          <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setGuestPracticeMode(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-700"
              >
                <ArrowLeft className="w-4 h-4" /> Overview
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="font-display font-bold text-base text-slate-900 dark:text-white">
                LexiScore Practice Preview
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label="Toggle theme"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => loginWithGoogle()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold"
              >
                Sign In to Save &amp; AI Score
              </button>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-8">
            <PracticeHubView
              selectedExam={selectedExam}
              onSelectExam={setSelectedExam}
              isAuthenticated={false}
              onRequireAuth={() => setGuestPracticeMode(false)}
              onStartMock={() => setGuestPracticeMode(false)}
            />
          </main>
        </div>
      );
    }

    return (
      <PublicLanding
        onEnterWorkspace={(examCode) => {
          if (examCode && EXAM_SPECS[examCode as ExamCode]) {
            setSelectedExam(examCode as ExamCode);
          }
          setGuestPracticeMode(true);
        }}
      />
    );
  }

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'practice', label: 'Practice & Mocks', icon: BookOpen },
    { id: 'tutor', label: 'AI Personal Tutor', icon: Sparkles },
    { id: 'teams', label: 'Teams & Live', icon: Users },
    { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
    ...(canAccessAdmin ? [{ id: 'admin' as WorkspaceTab, label: 'Admin & CMS', icon: Shield }] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Workspace';

  const SidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            LexiScore
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-500"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Card */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt={account.fullName} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-xs font-bold text-indigo-700 dark:text-indigo-300">
                {(account.fullName || account.email).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{account.fullName}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
              {account.role.replace('_', ' ')}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/50 flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{activeNavLabel}</div>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value as ExamCode)}
              aria-label="Active exam"
              className="hidden sm:block rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {EXAM_LIST.map((ex) => (
                <option key={ex.code} value={ex.code}>
                  {ex.shortName}
                </option>
              ))}
            </select>

            <PWAInstallButton />

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle light and dark theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-[10px] font-mono font-bold text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg z-40">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.map((n) => (
                      <div key={n.id} className={`p-3.5 text-xs ${n.isRead ? 'opacity-65' : ''}`}>
                        <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-400 leading-relaxed">{n.body}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-500">All caught up.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              selectedExam={selectedExam}
              onSelectExam={setSelectedExam}
              onNavigate={(tab) => setActiveTab(tab)}
              onResumeMock={(session) => setActiveMock(session)}
            />
          )}
          {activeTab === 'practice' && (
            <PracticeHubView
              selectedExam={selectedExam}
              onSelectExam={setSelectedExam}
              isAuthenticated={true}
              onRequireAuth={() => {}}
              onStartMock={(session) => setActiveMock(session)}
            />
          )}
          {activeTab === 'tutor' && (
            <TutorView selectedExam={selectedExam} onSelectExam={setSelectedExam} />
          )}
          {activeTab === 'teams' && <TeamsView />}
          {activeTab === 'billing' && <BillingView />}
          {activeTab === 'admin' && canAccessAdmin && <AdminView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <OfflineIndicator />
      <LexiScoreShell />
    </AuthProvider>
  );
}
