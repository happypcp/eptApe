import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { adminAuth } from '../lib/firebase-admin.ts';

interface Participant {
  uid: string;
  name: string;
  role: string;
  score: number;
  completedCount: number;
  joinedAt: string;
}

interface RoomState {
  roomCode: string;
  activeQuestionId: number | null;
  participants: Map<string, Participant>;
  messages: Array<{ id: string; sender: string; role: string; text: string; createdAt: string }>;
  sockets: Set<WebSocket>;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomCode: string): RoomState {
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      roomCode,
      activeQuestionId: null,
      participants: new Map(),
      messages: [],
      sockets: new Set(),
    };
    rooms.set(roomCode, room);
  }
  return room;
}

function broadcastRoom(room: RoomState, event: string, payload: unknown) {
  const frame = JSON.stringify({ event, payload });
  for (const client of room.sockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(frame);
    }
  }
}

function serializeRoom(room: RoomState) {
  return {
    roomCode: room.roomCode,
    activeQuestionId: room.activeQuestionId,
    participants: Array.from(room.participants.values()).sort((a, b) => b.score - a.score),
    messages: room.messages.slice(-40),
  };
}

export function attachWebSocketGateway(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let joinedRoom: RoomState | null = null;
    let clientUid = '';

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { event?: string; payload?: Record<string, unknown> };
        const event = msg.event;
        const payload = msg.payload || {};

        if (event === 'room:join') {
          const roomCode = String(payload.roomCode || '').trim().toUpperCase().slice(0, 24);
          const token = String(payload.token || '').trim();
          if (!roomCode) return;

          let uid = `guest-${Math.random().toString(36).slice(2, 8)}`;
          let name = String(payload.name || 'Learner').slice(0, 48);
          let role = String(payload.role || 'student');

          if (token) {
            try {
              const decoded = await adminAuth.verifyIdToken(token);
              uid = decoded.uid;
              name = decoded.name || decoded.email?.split('@')[0] || name;
            } catch {
              ws.send(JSON.stringify({ event: 'error', payload: { message: 'Authentication failed for live session.' } }));
              return;
            }
          }

          clientUid = uid;
          joinedRoom = getOrCreateRoom(roomCode);
          joinedRoom.sockets.add(ws);

          if (!joinedRoom.participants.has(uid)) {
            joinedRoom.participants.set(uid, {
              uid,
              name,
              role,
              score: 0,
              completedCount: 0,
              joinedAt: new Date().toISOString(),
            });
          }

          ws.send(JSON.stringify({ event: 'room:state', payload: serializeRoom(joinedRoom) }));
          broadcastRoom(joinedRoom, 'room:presence', {
            participants: Array.from(joinedRoom.participants.values()).sort((a, b) => b.score - a.score),
          });
          return;
        }

        if (!joinedRoom || !clientUid) return;

        if (event === 'room:message') {
          const text = String(payload.text || '').trim().slice(0, 500);
          if (!text) return;
          const p = joinedRoom.participants.get(clientUid);
          const id = String(payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
          if (!joinedRoom.messages.some((m) => m.id === id)) {
            const entry = {
              id,
              sender: p?.name || 'Member',
              role: p?.role || 'student',
              text,
              createdAt: new Date().toISOString(),
            };
            joinedRoom.messages.push(entry);
            if (joinedRoom.messages.length > 100) joinedRoom.messages.shift();
            broadcastRoom(joinedRoom, 'room:message', entry);
          }
          return;
        }

        if (event === 'room:set_question') {
          const qId = Number(payload.questionId) || null;
          joinedRoom.activeQuestionId = qId;
          broadcastRoom(joinedRoom, 'room:question_changed', { activeQuestionId: qId });
          return;
        }

        if (event === 'room:score_update') {
          const delta = Math.max(0, Math.min(160, Number(payload.score) || 0));
          const p = joinedRoom.participants.get(clientUid);
          if (p) {
            p.score = Math.round((p.score * p.completedCount + delta) / (p.completedCount + 1));
            p.completedCount += 1;
            broadcastRoom(joinedRoom, 'room:presence', {
              participants: Array.from(joinedRoom.participants.values()).sort((a, b) => b.score - a.score),
            });
          }
        }
      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', () => {
      if (joinedRoom) {
        joinedRoom.sockets.delete(ws);
        if (clientUid) {
          joinedRoom.participants.delete(clientUid);
          broadcastRoom(joinedRoom, 'room:presence', {
            participants: Array.from(joinedRoom.participants.values()).sort((a, b) => b.score - a.score),
          });
        }
        if (joinedRoom.sockets.size === 0) {
          rooms.delete(joinedRoom.roomCode);
        }
      }
    });
  });

  return wss;
}
