import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './src/db/index.ts';
import {
  aiAssessments,
  analyticsEvents,
  assignments,
  auditLogs,
  collaborativeSessions,
  coupons,
  mockTestQuestions,
  mockTests,
  notifications,
  organizations,
  payments,
  questions,
  studentResponses,
  studyPlans,
  subscriptionPlans,
  subscriptions,
  teamMembers,
  teams,
  testAttempts,
  tutorMessages,
  userProfiles,
  users,
} from './src/db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth, requireRole } from './src/middleware/auth.ts';
import { EXAM_LIST, EXAM_SPECS, ExamCode, formatExamScore } from './src/shared/examSpecs.ts';
import { ensureDatabaseSeeded } from './src/server/seedData.ts';
import { computeAttemptScoreSummary, gradeObjectiveQuestion } from './src/server/gradingEngine.ts';
import {
  evaluateSpeakingResponse,
  evaluateWritingResponse,
  generatePersonalizedStudyPlan,
  generateTutorReply,
  synthesizeExamAudio,
} from './src/server/aiProviders.ts';
import {
  getPaymentGatewayStatuses,
  initiateProviderCheckout,
  PaymentGatewayCode,
  verifyStripeWebhookSignature,
} from './src/server/paymentProviders.ts';
import { attachWebSocketGateway } from './src/server/wsGateway.ts';
import { buildOpenApiSpec } from './src/server/openapi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.set('trust proxy', 1);

// Security headers (iframe-friendly, no X-Frame-Options blocking preview)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Simple sliding-window rate limiter for AI and mutation endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'anon'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMinute) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please pause briefly and try again.' });
    }
    bucket.count += 1;
    return next();
  };
}

// Raw body capture for Stripe webhook signature verification before JSON parser
app.post('/api/billing/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = String(req.headers['stripe-signature'] || '');
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (!verifyStripeWebhookSignature(rawBody, sig)) {
    return res.status(400).json({ error: 'Invalid Stripe webhook signature or unconfigured secret.' });
  }
  try {
    const event = JSON.parse(rawBody) as { type?: string; data?: { object?: { client_reference_id?: string; id?: string } } };
    if (event.type === 'checkout.session.completed' && event.data?.object?.client_reference_id) {
      const invoiceNo = event.data.object.client_reference_id;
      await db
        .update(payments)
        .set({ status: 'verified', providerRef: event.data.object.id || null })
        .where(eq(payments.invoiceNumber, invoiceNo));
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

app.use(express.json({ limit: '12mb' }));

// Lazy seed guard on API requests (never blocks startup or probes DB at boot)
async function withSeed(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDatabaseSeeded();
    return next();
  } catch (error) {
    console.error('Database initialization error:', error);
    return res.status(503).json({ error: 'Database is temporarily unavailable. Please retry in a moment.' });
  }
}

// ==================== SEO, AEO & OPENAPI ROUTES ====================
app.get('/robots.txt', (_req, res) => {
  const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (_req, res) => {
  const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  const urls = ['', '/#exams', '/#ai-scoring', '/#pricing', '/#guides'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${baseUrl}${u}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n')}\n</urlset>`;
  res.type('application/xml').send(xml);
});

app.get('/api/openapi.json', (req, res) => {
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json(buildOpenApiSpec(baseUrl));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lexiscore-api' });
});

// ==================== PUBLIC CATALOG ROUTES ====================
app.get('/api/exams', withSeed, async (_req, res) => {
  try {
    const counts = await db
      .select({
        examCode: questions.examCode,
        total: sql<number>`count(*)::int`,
      })
      .from(questions)
      .where(eq(questions.status, 'published'))
      .groupBy(questions.examCode);

    const countMap = new Map(counts.map((c) => [c.examCode, c.total]));
    const payload = EXAM_LIST.map((spec) => ({
      ...spec,
      publishedQuestionCount: countMap.get(spec.code) || 0,
    }));
    res.json({ exams: payload });
  } catch (error) {
    console.error('GET /api/exams error:', error);
    res.status(500).json({ error: 'Failed to load exams.' });
  }
});

app.get('/api/questions', withSeed, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const examCode = String(req.query.exam || '').trim();
    const sectionCode = String(req.query.section || '').trim();
    const typeCode = String(req.query.type || '').trim();
    const difficulty = String(req.query.difficulty || '').trim();
    const search = String(req.query.search || '').trim();
    const includeAllStatuses =
      req.query.includeAll === 'true' &&
      req.dbUser &&
      ['super_admin', 'admin', 'teacher'].includes(req.dbUser.role);

    const conditions = [];
    if (!includeAllStatuses) conditions.push(eq(questions.status, 'published'));
    if (examCode) conditions.push(eq(questions.examCode, examCode));
    if (sectionCode && sectionCode !== 'all') conditions.push(eq(questions.sectionCode, sectionCode));
    if (typeCode && typeCode !== 'all') conditions.push(eq(questions.typeCode, typeCode));
    if (difficulty && difficulty !== 'all') conditions.push(eq(questions.difficulty, difficulty));
    if (search) {
      conditions.push(or(ilike(questions.title, `%${search}%`), ilike(questions.topic, `%${search}%`)));
    }

    const rows = await db
      .select()
      .from(questions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(questions.id)
      .limit(200);

    res.json({ questions: rows });
  } catch (error) {
    console.error('GET /api/questions error:', error);
    res.status(500).json({ error: 'Failed to load question bank.' });
  }
});

app.get('/api/mock-tests', withSeed, async (req, res) => {
  try {
    const examCode = String(req.query.exam || '').trim();
    const rows = await db
      .select()
      .from(mockTests)
      .where(examCode ? and(eq(mockTests.examCode, examCode), eq(mockTests.status, 'published')) : eq(mockTests.status, 'published'))
      .orderBy(mockTests.id);

    const mtqRows = await db
      .select({
        mockTestId: mockTestQuestions.mockTestId,
        count: sql<number>`count(*)::int`,
      })
      .from(mockTestQuestions)
      .groupBy(mockTestQuestions.mockTestId);
    const countMap = new Map(mtqRows.map((r) => [r.mockTestId, r.count]));

    res.json({
      mockTests: rows.map((m) => ({
        ...m,
        questionCount: countMap.get(m.id) || 0,
      })),
    });
  } catch (error) {
    console.error('GET /api/mock-tests error:', error);
    res.status(500).json({ error: 'Failed to load mock tests.' });
  }
});

// ==================== USER PROFILE & ACCOUNT ROUTES ====================
app.get('/api/me', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, u.id)).limit(1);
    const activeSubs = await db
      .select({
        subscription: subscriptions,
        plan: subscriptionPlans,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.userId, u.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const recentNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, u.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    res.json({
      user: u,
      profile: profile || null,
      subscription: activeSubs[0] || null,
      notifications: recentNotifs,
    });
  } catch (error) {
    console.error('GET /api/me error:', error);
    res.status(500).json({ error: 'Failed to load account profile.' });
  }
});

const profilePatchSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().max(500000).nullable().optional(),
  targetExam: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']).optional(),
  targetScore: z.string().min(1).max(20).optional(),
  examDate: z.string().max(30).nullable().optional(),
  weeklyHours: z.number().int().min(1).max(80).optional(),
  nativeLanguage: z.string().max(60).optional(),
  bio: z.string().max(500).optional(),
  notificationPrefsJson: z
    .object({
      email: z.boolean(),
      inApp: z.boolean(),
      studyReminders: z.boolean(),
      aiCompleted: z.boolean(),
    })
    .optional(),
});

app.patch('/api/me', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid profile update payload.', details: parsed.error.flatten() });
    }
    const u = req.dbUser!;
    const data = parsed.data;

    if (data.fullName !== undefined || data.avatarUrl !== undefined) {
      await db
        .update(users)
        .set({
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, u.id));
    }

    const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.targetExam !== undefined) profileUpdates.targetExam = data.targetExam;
    if (data.targetScore !== undefined) profileUpdates.targetScore = data.targetScore;
    if (data.examDate !== undefined) profileUpdates.examDate = data.examDate;
    if (data.weeklyHours !== undefined) profileUpdates.weeklyHours = data.weeklyHours;
    if (data.nativeLanguage !== undefined) profileUpdates.nativeLanguage = data.nativeLanguage;
    if (data.bio !== undefined) profileUpdates.bio = data.bio;
    if (data.notificationPrefsJson !== undefined) profileUpdates.notificationPrefsJson = data.notificationPrefsJson;

    await db.update(userProfiles).set(profileUpdates).where(eq(userProfiles.userId, u.id));
    res.json({ updated: true });
  } catch (error) {
    console.error('PATCH /api/me error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.post('/api/notifications/read-all', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, req.dbUser!.id));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

app.get('/api/me/export', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.dbUser!.id;
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, uid));
    const userAttempts = await db.select().from(testAttempts).where(eq(testAttempts.userId, uid));
    const userAssessments = await db.select().from(aiAssessments).where(eq(aiAssessments.userId, uid));
    const userPlans = await db.select().from(studyPlans).where(eq(studyPlans.userId, uid));
    res.json({
      exportedAt: new Date().toISOString(),
      account: req.dbUser,
      profile,
      attempts: userAttempts,
      aiAssessments: userAssessments,
      studyPlans: userPlans,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to export user data.' });
  }
});

app.delete('/api/me', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, req.dbUser!.id));
    await db.insert(auditLogs).values({
      actorUserId: req.dbUser!.id,
      action: 'account.soft_delete',
      targetEntity: 'users',
      targetId: String(req.dbUser!.id),
    });
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// ==================== MOCK TEST ENGINE & OBJECTIVE GRADING ====================
app.post('/api/practice/grade-objective', withSeed, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      questionId: z.number().int().positive(),
      submittedAnswer: z.record(z.string(), z.unknown()),
      timeSpentSec: z.number().int().min(0).max(7200).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid submission format.' });

    const [q] = await db.select().from(questions).where(eq(questions.id, parsed.data.questionId)).limit(1);
    if (!q) return res.status(404).json({ error: 'Question not found.' });

    const result = gradeObjectiveQuestion({
      examCode: q.examCode,
      typeCode: q.typeCode,
      answerKey: q.answerKeyJson || {},
      acceptedVariants: q.acceptedVariantsJson || [],
      submittedAnswer: parsed.data.submittedAnswer,
      scoringConfig: q.scoringConfigJson || {},
    });

    // If user is authenticated, persist a practice attempt + response for analytics
    if (req.dbUser) {
      const scaled = computeAttemptScoreSummary(q.examCode, {
        [q.sectionCode]: { earned: result.score, max: result.maxScore },
      });
      const [attempt] = await db
        .insert(testAttempts)
        .values({
          userId: req.dbUser.id,
          examCode: q.examCode,
          mode: 'practice',
          status: 'completed',
          completedAt: new Date(),
          elapsedSec: parsed.data.timeSpentSec || 30,
          overallScore: scaled.overallScore,
          sectionScoresJson: scaled.sectionScores,
          metadataJson: { questionTitle: q.title, typeCode: q.typeCode },
        })
        .returning();

      await db.insert(studentResponses).values({
        attemptId: attempt.id,
        userId: req.dbUser.id,
        questionId: q.id,
        answerJson: parsed.data.submittedAnswer,
        objectiveScore: result.score,
        maxScore: result.maxScore,
        isCorrect: result.isCorrect,
        timeSpentSec: parsed.data.timeSpentSec || 30,
      });

      await db.insert(analyticsEvents).values({
        userId: req.dbUser.id,
        eventName: 'practice.objective_graded',
        examCode: q.examCode,
        propertiesJson: { typeCode: q.typeCode, accuracyPct: result.accuracyPct },
      });
    }

    res.json({
      result,
      explanation: q.explanation,
      answerKey: q.answerKeyJson,
    });
  } catch (error) {
    console.error('POST /api/practice/grade-objective error:', error);
    res.status(500).json({ error: 'Failed to grade objective answer.' });
  }
});

app.get('/api/attempts', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.userId, req.dbUser!.id))
      .orderBy(desc(testAttempts.startedAt))
      .limit(50);

    res.json({ attempts: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load attempts.' });
  }
});

app.post('/api/attempts', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      mockTestId: z.number().int().positive().optional(),
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      mode: z.enum(['full_mock', 'sectional_mock', 'adaptive', 'practice']).default('full_mock'),
      sectionFilter: z.string().optional(),
      difficulty: z.enum(['easy', 'medium', 'hard', 'all']).optional(),
      timed: z.boolean().default(true),
      randomize: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid mock test configuration.' });

    const { mockTestId, examCode, mode, sectionFilter, difficulty, timed, randomize } = parsed.data;
    let questionRows: Array<typeof questions.$inferSelect> = [];
    let durationSec = 2400;
    let title = `${EXAM_SPECS[examCode].name} Custom Session`;

    if (mockTestId) {
      const [mt] = await db.select().from(mockTests).where(eq(mockTests.id, mockTestId)).limit(1);
      if (!mt) return res.status(404).json({ error: 'Mock test not found.' });
      durationSec = timed ? mt.durationSec : 0;
      title = mt.title;

      const links = await db
        .select()
        .from(mockTestQuestions)
        .where(eq(mockTestQuestions.mockTestId, mt.id))
        .orderBy(mockTestQuestions.displayOrder);
      const qIds = links.map((l) => l.questionId);
      if (qIds.length > 0) {
        const fetched = await db.select().from(questions).where(inArray(questions.id, qIds));
        const byId = new Map(fetched.map((q) => [q.id, q]));
        questionRows = qIds.map((id) => byId.get(id)).filter(Boolean) as typeof fetched;
      }
    } else {
      const conds = [eq(questions.examCode, examCode), eq(questions.status, 'published')];
      if (sectionFilter && sectionFilter !== 'all') conds.push(eq(questions.sectionCode, sectionFilter));
      if (difficulty && difficulty !== 'all') conds.push(eq(questions.difficulty, difficulty));
      questionRows = await db.select().from(questions).where(and(...conds)).orderBy(questions.id).limit(20);
      durationSec = timed ? Math.max(600, questionRows.length * 180) : 0;
    }

    if (randomize && questionRows.length > 1) {
      questionRows = [...questionRows].sort(() => Math.random() - 0.5);
    }

    if (questionRows.length === 0) {
      return res.status(400).json({ error: 'No published questions matched the selected mock criteria.' });
    }

    const [attempt] = await db
      .insert(testAttempts)
      .values({
        userId: req.dbUser!.id,
        mockTestId: mockTestId || null,
        examCode,
        mode,
        status: 'in_progress',
        remainingSec: durationSec,
        metadataJson: {
          title,
          timed,
          questionIds: questionRows.map((q) => q.id),
        },
      })
      .returning();

    res.status(201).json({
      attempt,
      questions: questionRows,
      responses: [],
    });
  } catch (error) {
    console.error('POST /api/attempts error:', error);
    res.status(500).json({ error: 'Failed to launch mock test session.' });
  }
});

app.get('/api/attempts/:id', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const attemptId = Number(req.params.id);
    if (!Number.isInteger(attemptId)) return res.status(400).json({ error: 'Invalid attempt ID.' });

    const [attempt] = await db.select().from(testAttempts).where(eq(testAttempts.id, attemptId)).limit(1);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (attempt.userId !== req.dbUser!.id && !['super_admin', 'admin', 'teacher'].includes(req.dbUser!.role)) {
      return res.status(403).json({ error: 'Access denied to this test attempt.' });
    }

    const meta = (attempt.metadataJson || {}) as { questionIds?: number[] };
    const qIds = Array.isArray(meta.questionIds) ? meta.questionIds : [];
    let qRows: Array<typeof questions.$inferSelect> = [];
    if (qIds.length > 0) {
      const fetched = await db.select().from(questions).where(inArray(questions.id, qIds));
      const byId = new Map(fetched.map((q) => [q.id, q]));
      qRows = qIds.map((id) => byId.get(id)).filter(Boolean) as typeof fetched;
    }

    const resps = await db.select().from(studentResponses).where(eq(studentResponses.attemptId, attemptId));
    const respIds = resps.map((r) => r.id);
    const aiRows =
      respIds.length > 0
        ? await db.select().from(aiAssessments).where(inArray(aiAssessments.responseId, respIds))
        : [];

    res.json({ attempt, questions: qRows, responses: resps, aiAssessments: aiRows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load test attempt.' });
  }
});

app.patch('/api/attempts/:id/save', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const attemptId = Number(req.params.id);
    const [attempt] = await db.select().from(testAttempts).where(eq(testAttempts.id, attemptId)).limit(1);
    if (!attempt || attempt.userId !== req.dbUser!.id) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    const schema = z.object({
      currentQuestionIndex: z.number().int().min(0).optional(),
      elapsedSec: z.number().int().min(0).optional(),
      remainingSec: z.number().int().min(0).optional(),
      status: z.enum(['in_progress', 'paused']).optional(),
      response: z
        .object({
          questionId: z.number().int().positive(),
          answerJson: z.record(z.string(), z.unknown()),
          transcriptText: z.string().optional(),
          isMarkedReview: z.boolean().optional(),
          timeSpentSec: z.number().int().min(0).optional(),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid save payload.' });

    const { currentQuestionIndex, elapsedSec, remainingSec, status, response } = parsed.data;
    await db
      .update(testAttempts)
      .set({
        ...(currentQuestionIndex !== undefined ? { currentQuestionIndex } : {}),
        ...(elapsedSec !== undefined ? { elapsedSec } : {}),
        ...(remainingSec !== undefined ? { remainingSec } : {}),
        ...(status !== undefined ? { status } : {}),
      })
      .where(eq(testAttempts.id, attemptId));

    if (response) {
      await db
        .insert(studentResponses)
        .values({
          attemptId,
          userId: req.dbUser!.id,
          questionId: response.questionId,
          answerJson: response.answerJson,
          transcriptText: response.transcriptText || null,
          isMarkedReview: Boolean(response.isMarkedReview),
          timeSpentSec: response.timeSpentSec || 0,
          savedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [studentResponses.attemptId, studentResponses.questionId],
          set: {
            answerJson: response.answerJson,
            transcriptText: response.transcriptText || null,
            isMarkedReview: Boolean(response.isMarkedReview),
            timeSpentSec: response.timeSpentSec || 0,
            savedAt: new Date(),
          },
        });
    }

    res.json({ saved: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('PATCH /api/attempts/:id/save error:', error);
    res.status(500).json({ error: 'Failed to auto-save attempt.' });
  }
});

app.post('/api/attempts/:id/submit', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const attemptId = Number(req.params.id);
    const [attempt] = await db.select().from(testAttempts).where(eq(testAttempts.id, attemptId)).limit(1);
    if (!attempt || attempt.userId !== req.dbUser!.id) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    const meta = (attempt.metadataJson || {}) as { questionIds?: number[] };
    const qIds = Array.isArray(meta.questionIds) ? meta.questionIds : [];
    const qRows = qIds.length > 0 ? await db.select().from(questions).where(inArray(questions.id, qIds)) : [];
    const resps = await db.select().from(studentResponses).where(eq(studentResponses.attemptId, attemptId));
    const respByQ = new Map(resps.map((r) => [r.questionId, r]));

    const sectionTallies: Record<string, { earned: number; max: number }> = {};
    const gradedDetails: Array<Record<string, unknown>> = [];

    for (const q of qRows) {
      const resp = respByQ.get(q.id);
      const ans = (resp?.answerJson || {}) as Record<string, unknown>;
      if (!sectionTallies[q.sectionCode]) sectionTallies[q.sectionCode] = { earned: 0, max: 0 };

      const spec = EXAM_SPECS[q.examCode as ExamCode];
      const qtSpec = spec?.questionTypes.find((t) => t.code === q.typeCode);
      const isObjective = !qtSpec || qtSpec.scoringMode === 'objective';

      if (isObjective) {
        const grade = gradeObjectiveQuestion({
          examCode: q.examCode,
          typeCode: q.typeCode,
          answerKey: q.answerKeyJson || {},
          acceptedVariants: q.acceptedVariantsJson || [],
          submittedAnswer: ans,
          scoringConfig: q.scoringConfigJson || {},
        });
        sectionTallies[q.sectionCode].earned += grade.score;
        sectionTallies[q.sectionCode].max += grade.maxScore;

        if (resp) {
          await db
            .update(studentResponses)
            .set({
              objectiveScore: grade.score,
              maxScore: grade.maxScore,
              isCorrect: grade.isCorrect,
            })
            .where(eq(studentResponses.id, resp.id));
        }

        gradedDetails.push({
          questionId: q.id,
          title: q.title,
          sectionCode: q.sectionCode,
          typeCode: q.typeCode,
          scoringMode: 'objective',
          grade,
          explanation: q.explanation,
        });
      } else {
        // Check if an AI assessment was already saved for this response/question in this attempt
        const existingAi = resp
          ? await db.select().from(aiAssessments).where(eq(aiAssessments.responseId, resp.id)).limit(1)
          : [];
        if (existingAi.length > 0 && spec) {
          const pct =
            (existingAi[0].overallScore - spec.scoreScaleMin) /
            Math.max(1, spec.scoreScaleMax - spec.scoreScaleMin);
          sectionTallies[q.sectionCode].earned += Math.max(0, Math.min(1, pct)) * 10;
          sectionTallies[q.sectionCode].max += 10;
        }
        gradedDetails.push({
          questionId: q.id,
          title: q.title,
          sectionCode: q.sectionCode,
          typeCode: q.typeCode,
          scoringMode: qtSpec.scoringMode,
          aiAssessment: existingAi[0] || null,
          submittedAnswer: ans,
          explanation: q.explanation,
        });
      }
    }

    const summary = computeAttemptScoreSummary(attempt.examCode, sectionTallies);
    const [updatedAttempt] = await db
      .update(testAttempts)
      .set({
        status: 'completed',
        completedAt: new Date(),
        elapsedSec: Number(req.body?.elapsedSec) || attempt.elapsedSec,
        remainingSec: 0,
        overallScore: summary.overallScore,
        sectionScoresJson: summary.sectionScores,
      })
      .where(eq(testAttempts.id, attemptId))
      .returning();

    await db.insert(notifications).values({
      userId: req.dbUser!.id,
      channel: 'in_app',
      category: 'mock_completed',
      title: `Mock Test Completed — ${formatExamScore(attempt.examCode, summary.overallScore)}`,
      body: `Your ${EXAM_SPECS[attempt.examCode as ExamCode]?.name || attempt.examCode} report is ready with section-by-section diagnostics.`,
    });

    await db.insert(analyticsEvents).values({
      userId: req.dbUser!.id,
      eventName: 'mock.completed',
      examCode: attempt.examCode,
      propertiesJson: { attemptId, overallScore: summary.overallScore },
    });

    res.json({
      attempt: updatedAttempt,
      summary,
      details: gradedDetails,
    });
  } catch (error) {
    console.error('POST /api/attempts/:id/submit error:', error);
    res.status(500).json({ error: 'Failed to submit and score mock test.' });
  }
});

// ==================== AI SCORING, TTS, TUTOR & STUDY PLANS ====================
app.post('/api/ai/tts', rateLimit(30), async (req, res) => {
  try {
    const schema = z.object({
      text: z.string().min(1).max(3000).optional(),
      voiceName: z.string().max(40).optional(),
      style: z.string().max(120).optional(),
      multiSpeaker: z
        .array(
          z.object({
            speaker: z.string().min(1).max(40),
            text: z.string().min(1).max(1200),
            style: z.string().max(120).optional(),
          })
        )
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || (!parsed.data.text && !parsed.data.multiSpeaker?.length)) {
      return res.status(400).json({ error: 'Provide text or multiSpeaker script for audio generation.' });
    }

    const result = await synthesizeExamAudio({
      text: parsed.data.text || '',
      voiceName: parsed.data.voiceName,
      style: parsed.data.style,
      multiSpeaker: parsed.data.multiSpeaker,
    });
    res.json({ audioBase64: result.base64Audio, mimeType: result.mimeType, cached: result.cached });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'TTS audio generation failed.';
    console.error('POST /api/ai/tts error:', error);
    res.status(502).json({ error: message });
  }
});

app.post('/api/ai/evaluate-speaking', withSeed, requireAuth, rateLimit(20), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      questionId: z.number().int().positive().optional(),
      attemptId: z.number().int().positive().optional(),
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      typeCode: z.string().min(1),
      taskName: z.string().min(1),
      promptText: z.string().min(1),
      referenceText: z.string().optional(),
      audioBase64: z.string().max(10_000_000).optional(),
      audioMime: z.string().max(60).optional(),
      manualTranscript: z.string().max(4000).optional(),
      durationSec: z.number().min(1).max(600).default(30),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid speaking evaluation payload.' });

    const evaluation = await evaluateSpeakingResponse(parsed.data);

    // Persist in PostgreSQL
    let responseId: number | null = null;
    if (parsed.data.attemptId && parsed.data.questionId) {
      const [savedResp] = await db
        .insert(studentResponses)
        .values({
          attemptId: parsed.data.attemptId,
          userId: req.dbUser!.id,
          questionId: parsed.data.questionId,
          answerJson: { transcript: evaluation.transcript },
          transcriptText: evaluation.transcript,
          audioMime: parsed.data.audioMime || 'audio/webm',
          audioDurationSec: parsed.data.durationSec,
          timeSpentSec: Math.round(parsed.data.durationSec),
        })
        .onConflictDoUpdate({
          target: [studentResponses.attemptId, studentResponses.questionId],
          set: {
            answerJson: { transcript: evaluation.transcript },
            transcriptText: evaluation.transcript,
            audioDurationSec: parsed.data.durationSec,
            savedAt: new Date(),
          },
        })
        .returning();
      responseId = savedResp.id;
    }

    const [savedAi] = await db
      .insert(aiAssessments)
      .values({
        responseId,
        userId: req.dbUser!.id,
        questionId: parsed.data.questionId || null,
        examCode: parsed.data.examCode,
        assessmentType: 'speaking',
        provider: evaluation.provider,
        modelUsed: evaluation.modelUsed,
        overallScore: evaluation.overallScore,
        subscoresJson: evaluation.subscores,
        wordFeedbackJson: evaluation.wordFeedback,
        suggestionsJson: evaluation.improvements,
        rawFeedbackSummary: evaluation.summary,
      })
      .returning();

    await db.insert(analyticsEvents).values({
      userId: req.dbUser!.id,
      eventName: 'ai.speaking_evaluated',
      examCode: parsed.data.examCode,
      propertiesJson: { typeCode: parsed.data.typeCode, score: evaluation.overallScore },
    });

    res.json({ evaluation, assessmentId: savedAi.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Speaking AI evaluation failed.';
    console.error('POST /api/ai/evaluate-speaking error:', error);
    res.status(502).json({ error: message });
  }
});

app.post('/api/ai/evaluate-writing', withSeed, requireAuth, rateLimit(20), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      questionId: z.number().int().positive().optional(),
      attemptId: z.number().int().positive().optional(),
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      typeCode: z.string().min(1),
      taskName: z.string().min(1),
      promptText: z.string().min(1),
      stimulusText: z.string().optional(),
      essayText: z.string().min(10).max(12000),
      minWords: z.number().int().optional(),
      maxWords: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please write at least 10 characters before scoring.' });

    const evaluation = await evaluateWritingResponse(parsed.data);

    let responseId: number | null = null;
    if (parsed.data.attemptId && parsed.data.questionId) {
      const [savedResp] = await db
        .insert(studentResponses)
        .values({
          attemptId: parsed.data.attemptId,
          userId: req.dbUser!.id,
          questionId: parsed.data.questionId,
          answerJson: { essayText: parsed.data.essayText },
          timeSpentSec: 120,
        })
        .onConflictDoUpdate({
          target: [studentResponses.attemptId, studentResponses.questionId],
          set: { answerJson: { essayText: parsed.data.essayText }, savedAt: new Date() },
        })
        .returning();
      responseId = savedResp.id;
    }

    const subscores: Record<string, number> = {};
    for (const c of evaluation.criteriaScores) {
      subscores[c.criterion] = c.score;
    }

    const [savedAi] = await db
      .insert(aiAssessments)
      .values({
        responseId,
        userId: req.dbUser!.id,
        questionId: parsed.data.questionId || null,
        examCode: parsed.data.examCode,
        assessmentType: 'writing',
        provider: evaluation.provider,
        modelUsed: evaluation.modelUsed,
        overallScore: evaluation.overallScore,
        subscoresJson: subscores,
        grammarHighlightsJson: evaluation.grammarErrors,
        suggestionsJson: evaluation.vocabularySuggestions.map((v) => `${v.original} → ${v.upgrade}: ${v.contextNote}`),
        improvedVersion: evaluation.improvedVersion,
        modelAnswer: evaluation.modelAnswer,
        rawFeedbackSummary: evaluation.feedbackSummary,
      })
      .returning();

    await db.insert(analyticsEvents).values({
      userId: req.dbUser!.id,
      eventName: 'ai.writing_evaluated',
      examCode: parsed.data.examCode,
      propertiesJson: { typeCode: parsed.data.typeCode, score: evaluation.overallScore },
    });

    res.json({ evaluation, assessmentId: savedAi.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Writing AI evaluation failed.';
    console.error('POST /api/ai/evaluate-writing error:', error);
    res.status(502).json({ error: message });
  }
});

app.get('/api/ai/tutor', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const examCode = String(req.query.exam || 'pte_academic');
    const msgs = await db
      .select()
      .from(tutorMessages)
      .where(and(eq(tutorMessages.userId, req.dbUser!.id), eq(tutorMessages.examCode, examCode)))
      .orderBy(tutorMessages.createdAt)
      .limit(40);
    res.json({ messages: msgs });
  } catch {
    res.status(500).json({ error: 'Failed to load AI tutor history.' });
  }
});

app.post('/api/ai/tutor', withSeed, requireAuth, rateLimit(25), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      message: z.string().min(1).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Message cannot be empty.' });

    const uid = req.dbUser!.id;
    const { examCode, message } = parsed.data;

    const history = await db
      .select()
      .from(tutorMessages)
      .where(and(eq(tutorMessages.userId, uid), eq(tutorMessages.examCode, examCode)))
      .orderBy(tutorMessages.createdAt)
      .limit(12);

    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, uid)).limit(1);
    const recentAssessments = await db
      .select()
      .from(aiAssessments)
      .where(and(eq(aiAssessments.userId, uid), eq(aiAssessments.examCode, examCode)))
      .orderBy(desc(aiAssessments.createdAt))
      .limit(5);

    const avg =
      recentAssessments.length > 0
        ? formatExamScore(
            examCode,
            recentAssessments.reduce((s, a) => s + a.overallScore, 0) / recentAssessments.length
          )
        : 'Not yet benchmarked';

    const reply = await generateTutorReply({
      examCode,
      message,
      history,
      studentContext: {
        targetScore: profile?.targetScore || '79',
        averageScore: avg,
        recentWeakTypes: recentAssessments.map((a) => a.assessmentType),
      },
    });

    await db.insert(tutorMessages).values([
      { userId: uid, examCode, role: 'user', content: message },
      { userId: uid, examCode, role: 'assistant', content: reply },
    ]);

    res.json({ reply });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'AI Tutor failed to respond.';
    res.status(502).json({ error: msg });
  }
});

app.get('/api/ai/study-plan', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const plans = await db
      .select()
      .from(studyPlans)
      .where(eq(studyPlans.userId, req.dbUser!.id))
      .orderBy(desc(studyPlans.createdAt))
      .limit(5);
    res.json({ studyPlans: plans });
  } catch {
    res.status(500).json({ error: 'Failed to load study plans.' });
  }
});

app.post('/api/ai/study-plan', withSeed, requireAuth, rateLimit(10), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      targetScore: z.string().min(1).max(20),
      currentEstimatedScore: z.string().min(1).max(20),
      examDate: z.string().max(30).optional(),
      weeklyHours: z.number().int().min(2).max(60).default(10),
      weakAreas: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid study plan parameters.' });

    const planJson = await generatePersonalizedStudyPlan(parsed.data);
    const [saved] = await db
      .insert(studyPlans)
      .values({
        userId: req.dbUser!.id,
        examCode: parsed.data.examCode,
        targetScore: parsed.data.targetScore,
        currentEstimatedScore: parsed.data.currentEstimatedScore,
        examDate: parsed.data.examDate || null,
        weeklyHours: parsed.data.weeklyHours,
        planJson,
      })
      .returning();

    res.status(201).json({ studyPlan: saved });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to generate study plan.';
    res.status(502).json({ error: msg });
  }
});

// ==================== STUDENT ANALYTICS ====================
app.get('/api/analytics/student', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.dbUser!.id;
    const examFilter = String(req.query.exam || '').trim();

    const attempts = await db
      .select()
      .from(testAttempts)
      .where(examFilter ? and(eq(testAttempts.userId, uid), eq(testAttempts.examCode, examFilter)) : eq(testAttempts.userId, uid))
      .orderBy(desc(testAttempts.startedAt))
      .limit(100);

    const assessments = await db
      .select()
      .from(aiAssessments)
      .where(examFilter ? and(eq(aiAssessments.userId, uid), eq(aiAssessments.examCode, examFilter)) : eq(aiAssessments.userId, uid))
      .orderBy(desc(aiAssessments.createdAt))
      .limit(100);

    const resps = await db
      .select({
        questionId: studentResponses.questionId,
        isCorrect: studentResponses.isCorrect,
        objectiveScore: studentResponses.objectiveScore,
        maxScore: studentResponses.maxScore,
        typeCode: questions.typeCode,
        sectionCode: questions.sectionCode,
        examCode: questions.examCode,
      })
      .from(studentResponses)
      .innerJoin(questions, eq(studentResponses.questionId, questions.id))
      .where(eq(studentResponses.userId, uid))
      .limit(300);

    const completedAttempts = attempts.filter((a) => a.status === 'completed');
    const totalPracticeSec = attempts.reduce((acc, a) => acc + (a.elapsedSec || 0), 0);
    const scoredValues = [
      ...completedAttempts.map((a) => a.overallScore).filter((s): s is number => typeof s === 'number'),
      ...assessments.map((a) => a.overallScore),
    ];

    const avgScore = scoredValues.length > 0 ? scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length : null;
    const highestScore = scoredValues.length > 0 ? Math.max(...scoredValues) : null;

    // Objective accuracy & weakest question types
    const typeAgg = new Map<string, { earned: number; max: number; count: number }>();
    let objEarned = 0;
    let objMax = 0;
    for (const r of resps) {
      if (examFilter && r.examCode !== examFilter) continue;
      if (typeof r.objectiveScore === 'number' && typeof r.maxScore === 'number' && r.maxScore > 0) {
        objEarned += r.objectiveScore;
        objMax += r.maxScore;
        const cur = typeAgg.get(r.typeCode) || { earned: 0, max: 0, count: 0 };
        cur.earned += r.objectiveScore;
        cur.max += r.maxScore;
        cur.count += 1;
        typeAgg.set(r.typeCode, cur);
      }
    }

    const weakestTypes = Array.from(typeAgg.entries())
      .map(([typeCode, v]) => ({
        typeCode,
        accuracyPct: Math.round((v.earned / v.max) * 100),
        attempts: v.count,
      }))
      .sort((a, b) => a.accuracyPct - b.accuracyPct)
      .slice(0, 5);

    // 4-Skill averages
    const skillBuckets: Record<string, number[]> = { speaking: [], writing: [], reading: [], listening: [] };
    for (const a of completedAttempts) {
      const secScores = (a.sectionScoresJson || {}) as Record<string, number>;
      for (const [k, v] of Object.entries(secScores)) {
        if (skillBuckets[k] && typeof v === 'number') skillBuckets[k].push(v);
      }
    }
    for (const a of assessments) {
      if (a.assessmentType === 'speaking') skillBuckets.speaking.push(a.overallScore);
      if (a.assessmentType === 'writing') skillBuckets.writing.push(a.overallScore);
    }

    const skillPerformance = Object.entries(skillBuckets).map(([skill, vals]) => ({
      skill: skill.charAt(0).toUpperCase() + skill.slice(1),
      score: vals.length > 0 ? Number((vals.reduce((s, n) => s + n, 0) / vals.length).toFixed(1)) : 0,
      sampleCount: vals.length,
    }));

    const trendSeries = [
      ...completedAttempts.map((a) => ({
        date: new Date(a.completedAt || a.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: a.overallScore || 0,
        label: a.mode,
      })),
      ...assessments.map((a) => ({
        date: new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: a.overallScore,
        label: `AI ${a.assessmentType}`,
      })),
    ]
      .reverse()
      .slice(-14);

    res.json({
      summary: {
        totalPracticeMinutes: Math.round(totalPracticeSec / 60),
        testsCompleted: completedAttempts.length,
        aiEvaluationsCount: assessments.length,
        averageScore: avgScore !== null ? Number(avgScore.toFixed(1)) : null,
        highestScore: highestScore !== null ? Number(highestScore.toFixed(1)) : null,
        accuracyPct: objMax > 0 ? Math.round((objEarned / objMax) * 100) : null,
      },
      skillPerformance,
      weakestTypes,
      trendSeries,
      recentAttempts: attempts.slice(0, 12),
      recentAssessments: assessments.slice(0, 10),
    });
  } catch (error) {
    console.error('GET /api/analytics/student error:', error);
    res.status(500).json({ error: 'Failed to compute student analytics.' });
  }
});

// ==================== BILLING & SUBSCRIPTIONS ====================
app.get('/api/billing/status', withSeed, optionalAuth, async (req: AuthRequest, res) => {
  try {
    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.monthlyPriceUsd);
    const gateways = getPaymentGatewayStatuses();
    let currentSubscription = null;
    let paymentHistory: Array<typeof payments.$inferSelect> = [];

    if (req.dbUser) {
      const subs = await db
        .select({ sub: subscriptions, plan: subscriptionPlans })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, req.dbUser.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      currentSubscription = subs[0] || null;

      paymentHistory = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, req.dbUser.id))
        .orderBy(desc(payments.createdAt))
        .limit(20);
    }

    res.json({ plans, gateways, currentSubscription, paymentHistory });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load billing status.' });
  }
});

app.post('/api/billing/validate-coupon', withSeed, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Enter a coupon code.' });
    const [c] = await db.select().from(coupons).where(and(eq(coupons.code, code), eq(coupons.isActive, true))).limit(1);
    if (!c) return res.status(404).json({ error: 'Coupon code not found or inactive.' });
    if (c.redeemedCount >= c.maxRedemptions) return res.status(400).json({ error: 'Coupon redemption limit reached.' });
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) return res.status(400).json({ error: 'Coupon has expired.' });
    res.json({ coupon: c });
  } catch {
    res.status(500).json({ error: 'Failed to validate coupon.' });
  }
});

app.post('/api/billing/checkout', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      planCode: z.enum(['free', 'basic', 'premium', 'professional', 'institutional']),
      billingCycle: z.enum(['monthly', 'quarterly', 'annual']),
      provider: z.enum(['stripe', 'khalti', 'esewa']),
      couponCode: z.string().max(40).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid checkout request.' });

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, parsed.data.planCode)).limit(1);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    // Free plan downgrade/activation requires no payment gateway
    if (plan.code === 'free') {
      const end = new Date();
      end.setFullYear(end.getFullYear() + 10);
      await db.insert(subscriptions).values({
        userId: req.dbUser!.id,
        planId: plan.id,
        billingCycle: 'monthly',
        status: 'active',
        provider: 'manual',
        currentPeriodEnd: end,
      });
      return res.json({ activatedFree: true, message: 'Switched to Free Explorer plan.' });
    }

    let priceUsd =
      parsed.data.billingCycle === 'annual'
        ? plan.annualPriceUsd
        : parsed.data.billingCycle === 'quarterly'
        ? plan.quarterlyPriceUsd
        : plan.monthlyPriceUsd;

    if (parsed.data.couponCode) {
      const [c] = await db
        .select()
        .from(coupons)
        .where(and(eq(coupons.code, parsed.data.couponCode.toUpperCase()), eq(coupons.isActive, true)))
        .limit(1);
      if (c && c.redeemedCount < c.maxRedemptions) {
        priceUsd =
          c.discountType === 'percent'
            ? Math.max(0, priceUsd * (1 - c.discountValue / 100))
            : Math.max(0, priceUsd - c.discountValue);
      }
    }

    const currency = parsed.data.provider === 'stripe' ? 'USD' : 'NPR';
    const amountCents =
      currency === 'NPR' ? Math.round(priceUsd * 135 * 100) : Math.round(priceUsd * 100);
    const invoiceNumber = `LX-${Date.now().toString(36).toUpperCase()}`;
    const returnUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

    const checkout = await initiateProviderCheckout({
      provider: parsed.data.provider as PaymentGatewayCode,
      amountCents,
      currency,
      planName: `${plan.name} (${parsed.data.billingCycle})`,
      invoiceNumber,
      userEmail: req.dbUser!.email,
      returnUrl,
    });

    if (!checkout.configured) {
      return res.status(503).json({
        configured: false,
        message: checkout.message,
        missingEnvVars: checkout.missingEnvVars,
      });
    }

    await db.insert(payments).values({
      userId: req.dbUser!.id,
      provider: parsed.data.provider,
      amountCents,
      currency,
      status: 'pending',
      providerRef: checkout.providerRef,
      invoiceNumber,
      couponCode: parsed.data.couponCode || null,
    });

    res.json({
      configured: true,
      checkoutUrl: checkout.checkoutUrl,
      invoiceNumber,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Checkout initiation failed.';
    res.status(500).json({ error: message });
  }
});

// ==================== TEAMS, ORGANIZATIONS & COLLABORATION ====================
app.get('/api/teams', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const memberships = await db
      .select({
        team: teams,
        roleInTeam: teamMembers.roleInTeam,
        orgName: organizations.name,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teamMembers.userId, u.id));

    const teamIds = memberships.map((m) => m.team.id);
    const teamAssignments =
      teamIds.length > 0
        ? await db.select().from(assignments).where(inArray(assignments.teamId, teamIds)).orderBy(desc(assignments.createdAt))
        : [];
    const liveSessions =
      teamIds.length > 0
        ? await db
            .select()
            .from(collaborativeSessions)
            .where(inArray(collaborativeSessions.teamId, teamIds))
            .orderBy(desc(collaborativeSessions.createdAt))
        : [];

    res.json({
      teams: memberships,
      assignments: teamAssignments,
      sessions: liveSessions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load teams.' });
  }
});

app.post('/api/teams', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      organizationName: z.string().min(2).max(100),
      teamName: z.string().min(2).max(100),
      description: z.string().max(400).optional(),
      examFocus: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']).default('pte_academic'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid organization/team fields.' });

    const u = req.dbUser!;
    let orgId = u.organizationId;
    if (!orgId) {
      const slug = `${parsed.data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      const [org] = await db
        .insert(organizations)
        .values({ name: parsed.data.organizationName, slug })
        .returning();
      orgId = org.id;
      await db.update(users).set({ organizationId: orgId }).where(eq(users.id, u.id));
    }

    const [team] = await db
      .insert(teams)
      .values({
        organizationId: orgId,
        name: parsed.data.teamName,
        description: parsed.data.description || '',
        examFocus: parsed.data.examFocus,
        createdBy: u.id,
      })
      .returning();

    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: u.id,
      roleInTeam: 'manager',
    });

    res.status(201).json({ team });
  } catch (error) {
    console.error('POST /api/teams error:', error);
    res.status(500).json({ error: 'Failed to create team.' });
  }
});

app.post('/api/teams/:id/assignments', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = Number(req.params.id);
    const schema = z.object({
      title: z.string().min(2).max(120),
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
      dueDate: z.string().max(30).optional(),
      instructions: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid assignment fields.' });

    const [created] = await db
      .insert(assignments)
      .values({
        teamId,
        assignedBy: req.dbUser!.id,
        title: parsed.data.title,
        examCode: parsed.data.examCode,
        dueDate: parsed.data.dueDate || null,
        instructions: parsed.data.instructions || '',
      })
      .returning();

    res.status(201).json({ assignment: created });
  } catch {
    res.status(500).json({ error: 'Failed to create assignment.' });
  }
});

app.post('/api/teams/:id/sessions', withSeed, requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = Number(req.params.id);
    const schema = z.object({
      title: z.string().min(2).max(120),
      examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid session fields.' });

    const roomCode = `LX-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const [session] = await db
      .insert(collaborativeSessions)
      .values({
        teamId,
        hostUserId: req.dbUser!.id,
        title: parsed.data.title,
        examCode: parsed.data.examCode,
        roomCode,
        status: 'live',
      })
      .returning();

    res.status(201).json({ session });
  } catch {
    res.status(500).json({ error: 'Failed to create live session.' });
  }
});

// ==================== ADMIN & QUESTION BANK CMS ====================
app.get(
  '/api/admin/overview',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin', 'org_owner', 'teacher', 'team_manager']),
  async (_req, res) => {
    try {
      const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [questionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(questions);
      const [attemptCount] = await db.select({ count: sql<number>`count(*)::int` }).from(testAttempts);
      const [aiCount] = await db.select({ count: sql<number>`count(*)::int` }).from(aiAssessments);
      const [orgCount] = await db.select({ count: sql<number>`count(*)::int` }).from(organizations);
      const [verifiedRevenue] = await db
        .select({ totalCents: sql<number>`coalesce(sum(amount_cents), 0)::int` })
        .from(payments)
        .where(eq(payments.status, 'verified'));

      const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(30);
      const recentAudit = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25);
      const allCoupons = await db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(20);

      res.json({
        stats: {
          totalUsers: userCount?.count || 0,
          totalQuestions: questionCount?.count || 0,
          totalAttempts: attemptCount?.count || 0,
          totalAiEvaluations: aiCount?.count || 0,
          totalOrganizations: orgCount?.count || 0,
          verifiedRevenueUsd: Number(((verifiedRevenue?.totalCents || 0) / 100).toFixed(2)),
        },
        users: recentUsers,
        auditLogs: recentAudit,
        coupons: allCoupons,
      });
    } catch (error) {
      console.error('GET /api/admin/overview error:', error);
      res.status(500).json({ error: 'Failed to load admin analytics.' });
    }
  }
);

app.patch(
  '/api/admin/users/:id/role',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const targetId = Number(req.params.id);
      const roleSchema = z.object({
        role: z.enum(['super_admin', 'admin', 'org_owner', 'teacher', 'team_manager', 'student']),
      });
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid role value.' });

      await db.update(users).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(users.id, targetId));
      await db.insert(auditLogs).values({
        actorUserId: req.dbUser!.id,
        action: 'user.role_updated',
        targetEntity: 'users',
        targetId: String(targetId),
        detailsJson: { newRole: parsed.data.role },
      });
      res.json({ updated: true });
    } catch {
      res.status(500).json({ error: 'Failed to update user role.' });
    }
  }
);

const questionCreateSchema = z.object({
  examCode: z.enum(['pte_academic', 'pte_core', 'ielts_academic', 'ielts_general', 'det']),
  sectionCode: z.enum(['speaking', 'writing', 'reading', 'listening', 'adaptive']),
  typeCode: z.string().min(2).max(80),
  title: z.string().min(3).max(200),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().min(2).max(100).default('General Academic'),
  promptText: z.string().min(5).max(3000),
  stimulusJson: z.record(z.string(), z.unknown()).default({}),
  answerKeyJson: z.record(z.string(), z.unknown()).default({}),
  explanation: z.string().max(2000).default(''),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
  sourceLicense: z.string().max(120).default('LexiScore Original Content'),
});

app.post(
  '/api/admin/questions',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin', 'teacher']),
  async (req: AuthRequest, res) => {
    try {
      const parsed = questionCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid question payload.', details: parsed.error.flatten() });

      const externalCode = `CUSTOM-${parsed.data.examCode.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db
        .insert(questions)
        .values({
          ...parsed.data,
          externalCode,
          createdBy: req.dbUser!.id,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorUserId: req.dbUser!.id,
        action: 'question.created',
        targetEntity: 'questions',
        targetId: String(created.id),
        detailsJson: { examCode: created.examCode, title: created.title },
      });

      res.status(201).json({ question: created });
    } catch (error) {
      console.error('POST /api/admin/questions error:', error);
      res.status(500).json({ error: 'Failed to create question.' });
    }
  }
);

app.patch(
  '/api/admin/questions/:id',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin', 'teacher']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const statusSchema = z.object({
        status: z.enum(['draft', 'review', 'published', 'archived']).optional(),
        title: z.string().min(3).max(200).optional(),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        explanation: z.string().max(2000).optional(),
      });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid question update.' });

      const [updated] = await db
        .update(questions)
        .set({
          ...parsed.data,
          versionNum: sql`${questions.versionNum} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(questions.id, id))
        .returning();

      res.json({ question: updated });
    } catch {
      res.status(500).json({ error: 'Failed to update question.' });
    }
  }
);

app.post(
  '/api/admin/questions/bulk-import',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const itemsSchema = z.object({
        items: z.array(questionCreateSchema).min(1).max(100),
      });
      const parsed = itemsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid bulk import batch.' });

      const existingTitles = new Set(
        (await db.select({ title: questions.title }).from(questions)).map((r) => r.title.toLowerCase())
      );

      let importedCount = 0;
      let duplicateCount = 0;
      for (const item of parsed.data.items) {
        if (existingTitles.has(item.title.toLowerCase())) {
          duplicateCount += 1;
          continue;
        }
        await db.insert(questions).values({
          ...item,
          externalCode: `IMP-${item.examCode.toUpperCase()}-${Date.now().toString(36)}-${importedCount}`,
          createdBy: req.dbUser!.id,
        });
        existingTitles.add(item.title.toLowerCase());
        importedCount += 1;
      }

      res.json({ importedCount, duplicateCount });
    } catch {
      res.status(500).json({ error: 'Bulk import failed.' });
    }
  }
);

app.post(
  '/api/admin/coupons',
  withSeed,
  requireAuth,
  requireRole(['super_admin', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        code: z.string().min(3).max(24),
        discountType: z.enum(['percent', 'fixed']).default('percent'),
        discountValue: z.number().positive().max(100),
        maxRedemptions: z.number().int().positive().default(100),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid coupon parameters.' });

      const [created] = await db
        .insert(coupons)
        .values({
          code: parsed.data.code.toUpperCase(),
          discountType: parsed.data.discountType,
          discountValue: parsed.data.discountValue,
          maxRedemptions: parsed.data.maxRedemptions,
        })
        .returning();
      res.status(201).json({ coupon: created });
    } catch {
      res.status(500).json({ error: 'Failed to create coupon (code may already exist).' });
    }
  }
);

// ==================== HTTP + WEBSOCKET + VITE STARTUP ====================
async function startServer() {
  const server = http.createServer(app);
  attachWebSocketGateway(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vitePromise = createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    vitePromise.catch((err) => {
      console.error('Vite dev middleware initialization error:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production bundle not built.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LexiScore server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
