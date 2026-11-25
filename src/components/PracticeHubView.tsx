import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Filter,
  Loader2,
  Play,
  Search,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import { EXAM_LIST, EXAM_SPECS, ExamCode } from '../shared/examSpecs';
import { apiFetch } from '../lib/api';
import { QuestionRecord, QuestionRenderer } from './QuestionRenderer';
import { ActiveMockSession } from './MockTestRunner';

interface MockTestCatalogItem {
  id: number;
  examCode: string;
  title: string;
  description: string;
  mode: string;
  sectionCode: string | null;
  durationSec: number;
  questionCount: number;
}

interface PracticeHubViewProps {
  selectedExam: ExamCode;
  onSelectExam: (code: ExamCode) => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onStartMock: (session: ActiveMockSession) => void;
}

export const PracticeHubView: React.FC<PracticeHubViewProps> = ({
  selectedExam,
  onSelectExam,
  isAuthenticated,
  onRequireAuth,
  onStartMock,
}) => {
  const spec = EXAM_SPECS[selectedExam] || EXAM_SPECS.pte_academic;

  const [hubTab, setHubTab] = useState<'questions' | 'mocks'>('questions');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionRecord | null>(null);
  const [practiceValues, setPracticeValues] = useState<Record<number, Record<string, unknown>>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  const [mockTests, setMockTests] = useState<MockTestCatalogItem[]>([]);
  const [loadingMocks, setLoadingMocks] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Custom Mock Builder state
  const [customSection, setCustomSection] = useState<string>('all');
  const [customDifficulty, setCustomDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [customTimed, setCustomTimed] = useState<boolean>(true);
  const [customRandomize, setCustomRandomize] = useState<boolean>(false);

  // Reset section/type filters on exam change
  useEffect(() => {
    setSectionFilter('all');
    setTypeFilter('all');
    setCustomSection('all');
  }, [selectedExam]);

  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    try {
      const params = new URLSearchParams({ exam: selectedExam });
      if (sectionFilter !== 'all') params.set('section', sectionFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (difficultyFilter !== 'all') params.set('difficulty', difficultyFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const data = await apiFetch<{ questions: QuestionRecord[] }>(`/api/questions?${params.toString()}`);
      setQuestions(data.questions || []);
      setSelectedQuestion((prev) => {
        if (prev && data.questions.some((q) => q.id === prev.id)) return prev;
        return data.questions[0] || null;
      });
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoadingQuestions(false);
    }
  }, [selectedExam, sectionFilter, typeFilter, difficultyFilter, searchQuery]);

  const loadMocks = useCallback(async () => {
    setLoadingMocks(true);
    try {
      const data = await apiFetch<{ mockTests: MockTestCatalogItem[] }>(`/api/mock-tests?exam=${selectedExam}`);
      setMockTests(data.mockTests || []);
    } catch (err) {
      console.error('Failed to load mock tests:', err);
    } finally {
      setLoadingMocks(false);
    }
  }, [selectedExam]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (hubTab === 'mocks') loadMocks();
  }, [hubTab, loadMocks]);

  const handleLaunchCatalogMock = async (mt: MockTestCatalogItem) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setLaunchingId(`mt-${mt.id}`);
    setLaunchError(null);
    try {
      const session = await apiFetch<ActiveMockSession>('/api/attempts', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          mockTestId: mt.id,
          examCode: mt.examCode,
          mode: mt.mode === 'sectional_mock' ? 'sectional_mock' : mt.mode === 'adaptive' ? 'adaptive' : 'full_mock',
          timed: true,
          randomize: false,
        }),
      });
      onStartMock(session);
    } catch (err: unknown) {
      setLaunchError(err instanceof Error ? err.message : 'Unable to start mock test.');
    } finally {
      setLaunchingId(null);
    }
  };

  const handleLaunchCustomMock = async () => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setLaunchingId('custom');
    setLaunchError(null);
    try {
      const session = await apiFetch<ActiveMockSession>('/api/attempts', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          examCode: selectedExam,
          mode: selectedExam === 'det' ? 'adaptive' : customSection === 'all' ? 'full_mock' : 'sectional_mock',
          sectionFilter: customSection,
          difficulty: customDifficulty,
          timed: customTimed,
          randomize: customRandomize,
        }),
      });
      onStartMock(session);
    } catch (err: unknown) {
      setLaunchError(err instanceof Error ? err.message : 'Unable to launch custom session.');
    } finally {
      setLaunchingId(null);
    }
  };

  const availableTypes = spec.questionTypes.filter(
    (qt) => sectionFilter === 'all' || qt.sectionCode === sectionFilter
  );

  return (
    <div className="space-y-6">
      {/* Exam Switcher + Practice/Mocks Segmented Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
          {EXAM_LIST.map((ex) => (
            <button
              key={ex.code}
              type="button"
              onClick={() => onSelectExam(ex.code)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedExam === ex.code
                  ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {ex.shortName}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setHubTab('questions')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              hubTab === 'questions'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Question Bank ({questions.length})
          </button>
          <button
            type="button"
            onClick={() => setHubTab('mocks')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              hubTab === 'mocks'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Mock Test Simulator
          </button>
        </div>
      </div>

      {/* Exam Specification Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {spec.providerLabel} · {spec.versionTag} · Native Scale {spec.scoreScaleMin}–{spec.scoreScaleMax} {spec.scoreUnit}
          </div>
          <h1 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{spec.name}</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSectionFilter('all');
              setTypeFilter('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sectionFilter === 'all'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            All Sections
          </button>
          {spec.sections.map((sec) => (
            <button
              key={sec.code}
              type="button"
              onClick={() => {
                setSectionFilter(sec.code);
                setTypeFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                sectionFilter === sec.code
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {sec.name}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== TAB 1: QUESTION BANK WORKBENCH ==================== */}
      {hubTab === 'questions' && (
        <>
          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions by title or topic..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by task type"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Task Types ({availableTypes.length})</option>
                {availableTypes.map((qt) => (
                  <option key={qt.code} value={qt.code}>
                    {qt.name}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              aria-label="Filter by difficulty"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Split-Pane Question List + Interactive Renderer */}
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">Practice Items</span>
                <span className="font-mono text-slate-500 tabular-nums">{questions.length} available</span>
              </div>

              {loadingQuestions ? (
                <div className="p-8 flex items-center justify-center text-xs text-slate-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading question bank...
                </div>
              ) : questions.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                  No questions match these filters. Clear search or choose another task type.
                </div>
              ) : (
                <div className="max-h-[680px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {questions.map((q) => {
                    const active = selectedQuestion?.id === q.id;
                    const qtMeta = spec.questionTypes.find((t) => t.code === q.typeCode);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelectedQuestion(q)}
                        className={`w-full text-left px-4 py-3.5 transition-colors ${
                          active
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-medium capitalize text-indigo-700 dark:text-indigo-400">
                            {qtMeta?.name || q.typeCode}
                          </span>
                          <span className="capitalize">{q.difficulty}</span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                          {q.title}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {q.topic} · {q.externalCode}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-8">
              {selectedQuestion ? (
                <QuestionRenderer
                  key={selectedQuestion.id}
                  question={selectedQuestion}
                  mode="practice"
                  value={practiceValues[selectedQuestion.id] || {}}
                  onChange={(val) =>
                    setPracticeValues((prev) => ({ ...prev, [selectedQuestion.id]: val }))
                  }
                  isAuthenticated={isAuthenticated}
                  onRequireAuth={onRequireAuth}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Select a question on the left to start practicing.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB 2: MOCK TEST SIMULATOR LIBRARY ==================== */}
      {hubTab === 'mocks' && (
        <div className="space-y-6">
          {launchError && (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-300">
              {launchError}
            </div>
          )}

          {/* Custom / Adaptive Mock Builder */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Custom Session Builder
                </div>
                <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  Configure a Timed, Untimed, or Randomized {spec.shortName} Simulation
                </h2>
              </div>
              <button
                type="button"
                disabled={launchingId === 'custom'}
                onClick={handleLaunchCustomMock}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {launchingId === 'custom' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Launch Custom Simulator
              </button>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Section Scope</label>
                <select
                  value={customSection}
                  onChange={(e) => setCustomSection(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="all">Full Multi-Section Exam</option>
                  {spec.sections.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} Only
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Difficulty Level</label>
                <select
                  value={customDifficulty}
                  onChange={(e) => setCustomDifficulty(e.target.value as 'all' | 'easy' | 'medium' | 'hard')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white"
                >
                  <option value="all">Balanced Mix (Recommended)</option>
                  <option value="easy">Foundation (Easy)</option>
                  <option value="medium">Standard (Medium)</option>
                  <option value="hard">Advanced (Hard)</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 cursor-pointer self-end">
                <input
                  type="checkbox"
                  checked={customTimed}
                  onChange={(e) => setCustomTimed(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" /> Strict Exam Countdown
                </span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 cursor-pointer self-end">
                <input
                  type="checkbox"
                  checked={customRandomize}
                  onChange={(e) => setCustomRandomize(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                  <Shuffle className="w-3.5 h-3.5 text-indigo-600" /> Randomize Order
                </span>
              </label>
            </div>
          </div>

          {/* Curated Official-Style Mock Catalog */}
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              Curated {spec.name} Mock Examinations
            </h2>

            {loadingMocks ? (
              <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading mock test library...
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockTests.map((mt) => (
                  <div
                    key={mt.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {mt.mode.replace('_', ' ')} · {mt.questionCount} questions · {Math.round(mt.durationSec / 60)} min
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">{mt.title}</h3>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {mt.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={launchingId === `mt-${mt.id}`}
                      onClick={() => handleLaunchCatalogMock(mt)}
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {launchingId === `mt-${mt.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      Start CBT Simulator
                    </button>
                  </div>
                ))}
                {mockTests.length === 0 && (
                  <div className="col-span-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
                    Use the Custom Session Builder above to launch a full or sectional {spec.name} mock test.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
