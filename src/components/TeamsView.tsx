import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Loader2,
  Plus,
  Radio,
  Send,
  Trophy,
  Users,
} from 'lucide-react';
import { EXAM_LIST, EXAM_SPECS, ExamCode } from '../shared/examSpecs';
import { apiFetch, getAuthToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { QuestionRecord } from './QuestionRenderer';

interface TeamMembership {
  team: {
    id: number;
    name: string;
    description: string;
    examFocus: string;
  };
  roleInTeam: string;
  orgName: string;
}

interface TeamAssignment {
  id: number;
  teamId: number;
  title: string;
  examCode: string;
  dueDate: string | null;
  instructions: string;
  createdAt: string;
}

interface LiveSession {
  id: number;
  teamId: number;
  title: string;
  examCode: string;
  roomCode: string;
  status: string;
}

interface WsParticipant {
  uid: string;
  name: string;
  role: string;
  score: number;
  completedCount: number;
}

interface WsMessage {
  id: string;
  sender: string;
  role: string;
  text: string;
  createdAt: string;
}

export const TeamsView: React.FC = () => {
  const { account } = useAuth();
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [assignments, setAssignments] = useState<TeamAssignment[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create team form
  const [orgName, setOrgName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamExam, setTeamExam] = useState<ExamCode>('pte_academic');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Create assignment form
  const [assignTeamId, setAssignTeamId] = useState<number>(0);
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDue, setAssignDue] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [creatingAssign, setCreatingAssign] = useState(false);

  // Create/Join Live Room
  const [sessionTitle, setSessionTitle] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Active WebSocket Room state
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [participants, setParticipants] = useState<WsParticipant[]>([]);
  const [roomMessages, setRoomMessages] = useState<WsMessage[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [roomQuestions, setRoomQuestions] = useState<QuestionRecord[]>([]);
  const [chatText, setChatText] = useState('');
  const [scoreInput, setScoreInput] = useState('76');
  const wsRef = useRef<WebSocket | null>(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        teams: TeamMembership[];
        assignments: TeamAssignment[];
        sessions: LiveSession[];
      }>('/api/teams', { requireToken: true });
      setMemberships(data.teams || []);
      setAssignments(data.assignments || []);
      setSessions(data.sessions || []);
      if (data.teams?.length && !assignTeamId) {
        setAssignTeamId(data.teams[0].team.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load teams.');
    } finally {
      setLoading(false);
    }
  }, [assignTeamId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const connectToRoom = async (roomCode: string, examCode = 'pte_academic') => {
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) return;

    wsRef.current?.close();
    setActiveRoomCode(cleanCode);
    setWsConnected(false);

    // Fetch a small list of questions for synced live prompt switching
    try {
      const qData = await apiFetch<{ questions: QuestionRecord[] }>(`/api/questions?exam=${examCode}`);
      setRoomQuestions((qData.questions || []).slice(0, 12));
    } catch {
      // Non-blocking
    }

    const token = await getAuthToken();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          event: 'room:join',
          payload: {
            roomCode: cleanCode,
            token: token || '',
            name: account?.fullName || 'Learner',
            role: account?.role || 'student',
          },
        })
      );
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as { event: string; payload: Record<string, unknown> };
        if (msg.event === 'room:state') {
          setParticipants((msg.payload.participants as WsParticipant[]) || []);
          setRoomMessages((msg.payload.messages as WsMessage[]) || []);
          setActiveQuestionId((msg.payload.activeQuestionId as number | null) ?? null);
        } else if (msg.event === 'room:presence') {
          setParticipants((msg.payload.participants as WsParticipant[]) || []);
        } else if (msg.event === 'room:message') {
          const entry = msg.payload as unknown as WsMessage;
          setRoomMessages((prev) => (prev.some((m) => m.id === entry.id) ? prev : [...prev, entry]));
        } else if (msg.event === 'room:question_changed') {
          setActiveQuestionId((msg.payload.activeQuestionId as number | null) ?? null);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };
  };

  const handleLeaveRoom = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setActiveRoomCode(null);
    setWsConnected(false);
    setParticipants([]);
    setRoomMessages([]);
  };

  const sendRoomChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !chatText.trim()) return;
    wsRef.current.send(
      JSON.stringify({
        event: 'room:message',
        payload: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: chatText.trim() },
      })
    );
    setChatText('');
  };

  const syncQuestion = (questionId: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ event: 'room:set_question', payload: { questionId } }));
  };

  const submitLiveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const score = Number(scoreInput);
    if (Number.isNaN(score)) return;
    wsRef.current.send(JSON.stringify({ event: 'room:score_update', payload: { score } }));
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTeam(true);
    setError(null);
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          organizationName: orgName.trim(),
          teamName: teamName.trim(),
          examFocus: teamExam,
        }),
      });
      setOrgName('');
      setTeamName('');
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create team.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTeamId) return;
    setCreatingAssign(true);
    setError(null);
    try {
      const targetTeam = memberships.find((m) => m.team.id === assignTeamId);
      await apiFetch(`/api/teams/${assignTeamId}/assignments`, {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({
          title: assignTitle.trim(),
          examCode: (targetTeam?.team.examFocus as ExamCode) || 'pte_academic',
          dueDate: assignDue || undefined,
          instructions: assignNotes.trim(),
        }),
      });
      setAssignTitle('');
      setAssignDue('');
      setAssignNotes('');
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment.');
    } finally {
      setCreatingAssign(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTeamId || !sessionTitle.trim()) return;
    setCreatingSession(true);
    setError(null);
    try {
      const targetTeam = memberships.find((m) => m.team.id === assignTeamId);
      const examCode = (targetTeam?.team.examFocus as ExamCode) || 'pte_academic';
      const data = await apiFetch<{ session: LiveSession }>(`/api/teams/${assignTeamId}/sessions`, {
        method: 'POST',
        requireToken: true,
        body: JSON.stringify({ title: sessionTitle.trim(), examCode }),
      });
      setSessionTitle('');
      await loadTeams();
      await connectToRoom(data.session.roomCode, examCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create live session.');
    } finally {
      setCreatingSession(false);
    }
  };

  const syncedQuestion = roomQuestions.find((q) => q.id === activeQuestionId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Organizations · Cohorts · Real-Time Collaborative Sessions
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
            Teams &amp; Live Group Practice
          </h1>
        </div>

        {/* Join any room by code */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connectToRoom(joinCodeInput);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            placeholder="Room code (e.g. LX-48A9K)"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white uppercase"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold"
          >
            <Radio className="w-3.5 h-3.5" /> Join Live Room
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ==================== ACTIVE WEBSOCKET LIVE ROOM ==================== */}
      {activeRoomCode && (
        <div className="rounded-2xl border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                Live WebSocket Practice Room · {wsConnected ? 'Connected' : 'Reconnecting...'}
              </div>
              <h2 className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-white">
                Room {activeRoomCode}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Leave Room
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Synced Practice Prompt + Leaderboard */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Synchronized Classroom Prompt
                  </span>
                  <select
                    value={activeQuestionId || ''}
                    onChange={(e) => syncQuestion(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 max-w-xs"
                  >
                    <option value="">Select question to push to room...</option>
                    {roomQuestions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title}
                      </option>
                    ))}
                  </select>
                </div>

                {syncedQuestion ? (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-4 space-y-2">
                    <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">
                      {EXAM_SPECS[syncedQuestion.examCode as ExamCode]?.name} · {syncedQuestion.typeCode}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{syncedQuestion.title}</div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {syncedQuestion.promptText}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Choose a question from the selector above to synchronize every connected learner to the same drill.
                  </p>
                )}

                <form onSubmit={submitLiveScore} className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Post round score to leaderboard:</span>
                  <input
                    type="number"
                    min={0}
                    max={160}
                    value={scoreInput}
                    onChange={(e) => setScoreInput(e.target.value)}
                    className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 font-mono text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 dark:bg-indigo-600 text-white px-3 py-1.5 font-semibold"
                  >
                    Update Score
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white mb-3">
                  <Trophy className="w-3.5 h-3.5 text-indigo-600" /> Live Participant Leaderboard ({participants.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {participants.map((p, idx) => (
                    <div key={p.uid} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-400 mr-2">#{idx + 1}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                        <span className="ml-2 text-[11px] text-slate-500 capitalize">· {p.role.replace('_', ' ')}</span>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                        {p.score} pts ({p.completedCount} rounds)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Room Chat / Announcements */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col h-96">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                Instructor Announcements &amp; Peer Chat
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs">
                {roomMessages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{m.sender}</span>
                      <span className="font-mono">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{m.text}</p>
                  </div>
                ))}
                {roomMessages.length === 0 && (
                  <p className="text-slate-400 text-center py-8">No messages in this room yet.</p>
                )}
              </div>
              <form onSubmit={sendRoomChat} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Share feedback or coaching cues..."
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== COHORTS, ASSIGNMENTS & CREATION FORMS ==================== */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          {/* Create Organization & Team */}
          <form
            onSubmit={handleCreateTeam}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
          >
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
              <Plus className="w-4 h-4 text-indigo-600" /> Create Academy Cohort / Study Team
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Organization / Institute Name</label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Meridian Language Academy"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Team / Batch Name</label>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="PTE 79+ Morning Intensive"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Primary Exam Focus</label>
              <select
                value={teamExam}
                onChange={(e) => setTeamExam(e.target.value as ExamCode)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                {EXAM_LIST.map((ex) => (
                  <option key={ex.code} value={ex.code}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={creatingTeam}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-xs font-semibold disabled:opacity-50"
            >
              {creatingTeam ? 'Creating Cohort...' : 'Create Team Workspace'}
            </button>
          </form>

          {/* Create Assignment & Launch Live Session */}
          {memberships.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Target Team</label>
                <select
                  value={assignTeamId}
                  onChange={(e) => setAssignTeamId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {memberships.map((m) => (
                    <option key={m.team.id} value={m.team.id}>
                      {m.team.name} ({m.orgName})
                    </option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleCreateSession} className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-900 dark:text-white">Start New Live Session</div>
                <input
                  type="text"
                  required
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="Weekly Speaking Speed Drill"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="w-full rounded-lg bg-slate-900 dark:bg-indigo-600 text-white py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {creatingSession ? 'Launching...' : 'Create & Enter Live Room'}
                </button>
              </form>

              <form onSubmit={handleCreateAssignment} className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-900 dark:text-white">Post Cohort Assignment</div>
                <input
                  type="text"
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="Complete 2 Read Aloud + 1 Essay"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="date"
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <textarea
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Instructions or target band..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={creatingAssign}
                  className="w-full rounded-lg border border-indigo-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {creatingAssign ? 'Assigning...' : 'Assign to Team'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right: Active Teams, Live Sessions, Assignments */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-4">
              <Users className="w-4 h-4 text-indigo-600" /> Your Cohorts &amp; Study Teams
            </div>
            {loading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading teams...
              </div>
            ) : memberships.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You have not joined or created a team yet. Create an institute cohort on the left or join any room code above.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {memberships.map((m) => (
                  <div key={m.team.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{m.team.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {m.orgName} · {EXAM_SPECS[m.team.examFocus as ExamCode]?.name || m.team.examFocus} · Role: {m.roleInTeam}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Active Live Practice Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No live rooms created for your teams yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((s) => (
                  <div key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{s.title}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Code: {s.roomCode} · {EXAM_SPECS[s.examCode as ExamCode]?.shortName || s.examCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => connectToRoom(s.roomCode, s.examCode)}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 text-xs font-semibold"
                    >
                      Enter Room
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white mb-3">
              <Calendar className="w-4 h-4 text-indigo-600" /> Team Assignments
            </div>
            {assignments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No assignments scheduled yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {assignments.map((a) => (
                  <div key={a.id} className="py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">{a.title}</span>
                      <span className="font-mono text-slate-500">{a.dueDate || 'Flexible'}</span>
                    </div>
                    {a.instructions && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{a.instructions}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
