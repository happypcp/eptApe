import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  planTier: text('plan_tier').notNull().default('institutional'),
  brandingJson: jsonb('branding_json').$type<{ primaryColor?: string; logoText?: string; footerNote?: string }>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default('Learner'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('student'),
    organizationId: integer('organization_id').references(() => organizations.id),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_org').on(table.organizationId),
  ]
);

export const userProfiles = pgTable('user_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  targetExam: text('target_exam').notNull().default('pte_academic'),
  targetScore: text('target_score').notNull().default('79'),
  examDate: text('exam_date'),
  weeklyHours: integer('weekly_hours').notNull().default(10),
  nativeLanguage: text('native_language').notNull().default(''),
  bio: text('bio').notNull().default(''),
  notificationPrefsJson: jsonb('notification_prefs_json')
    .$type<{ email: boolean; inApp: boolean; studyReminders: boolean; aiCompleted: boolean }>()
    .default({ email: true, inApp: true, studyReminders: true, aiCompleted: true }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teams = pgTable(
  'teams',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    examFocus: text('exam_focus').notNull().default('pte_academic'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_teams_org').on(table.organizationId)]
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    roleInTeam: text('role_in_team').notNull().default('student'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_team_member').on(table.teamId, table.userId)]
);

export const exams = pgTable('exams', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  providerLabel: text('provider_label').notNull(),
  scoreScaleMin: real('score_scale_min').notNull(),
  scoreScaleMax: real('score_scale_max').notNull(),
  scoreStep: real('score_step').notNull().default(1),
  description: text('description').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const examVersions = pgTable(
  'exam_versions',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .references(() => exams.id, { onDelete: 'cascade' })
      .notNull(),
    versionTag: text('version_tag').notNull(),
    effectiveDate: text('effective_date').notNull(),
    scoringConfigJson: jsonb('scoring_config_json').$type<Record<string, unknown>>().default({}),
    timingConfigJson: jsonb('timing_config_json').$type<Record<string, unknown>>().default({}),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_exam_versions_exam').on(table.examId)]
);

export const sections = pgTable(
  'sections',
  {
    id: serial('id').primaryKey(),
    examVersionId: integer('exam_version_id')
      .references(() => examVersions.id, { onDelete: 'cascade' })
      .notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    defaultDurationSec: integer('default_duration_sec').notNull().default(1800),
  },
  (table) => [index('idx_sections_version').on(table.examVersionId)]
);

export const questionTypes = pgTable(
  'question_types',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .references(() => sections.id, { onDelete: 'cascade' })
      .notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    prepTimeSec: integer('prep_time_sec').notNull().default(0),
    responseTimeSec: integer('response_time_sec').notNull().default(60),
    scoringMode: text('scoring_mode').notNull().default('objective'),
    rubricConfigJson: jsonb('rubric_config_json').$type<Record<string, unknown>>().default({}),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [index('idx_qtypes_section').on(table.sectionId)]
);

export const questions = pgTable(
  'questions',
  {
    id: serial('id').primaryKey(),
    externalCode: text('external_code').notNull().unique(),
    questionTypeId: integer('question_type_id').references(() => questionTypes.id),
    examCode: text('exam_code').notNull(),
    sectionCode: text('section_code').notNull(),
    typeCode: text('type_code').notNull(),
    title: text('title').notNull(),
    difficulty: text('difficulty').notNull().default('medium'),
    topic: text('topic').notNull().default('General Academic'),
    promptText: text('prompt_text').notNull(),
    stimulusJson: jsonb('stimulus_json').$type<Record<string, unknown>>().default({}),
    mediaJson: jsonb('media_json').$type<Record<string, unknown>>().default({}),
    answerKeyJson: jsonb('answer_key_json').$type<Record<string, unknown>>().default({}),
    acceptedVariantsJson: jsonb('accepted_variants_json').$type<string[]>().default([]),
    explanation: text('explanation').notNull().default(''),
    scoringConfigJson: jsonb('scoring_config_json').$type<Record<string, unknown>>().default({}),
    sourceLicense: text('source_license').notNull().default('LexiScore Original Content'),
    status: text('status').notNull().default('published'),
    versionNum: integer('version_num').notNull().default(1),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_questions_exam_section').on(table.examCode, table.sectionCode, table.typeCode),
    index('idx_questions_status').on(table.status),
  ]
);

export const mockTests = pgTable(
  'mock_tests',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    examCode: text('exam_code').notNull(),
    examVersionId: integer('exam_version_id').references(() => examVersions.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    mode: text('mode').notNull().default('full'),
    sectionFilter: text('section_filter'),
    durationSec: integer('duration_sec').notNull().default(3600),
    isFree: boolean('is_free').notNull().default(true),
    status: text('status').notNull().default('published'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_mock_tests_exam').on(table.examCode)]
);

export const mockTestQuestions = pgTable(
  'mock_test_questions',
  {
    id: serial('id').primaryKey(),
    mockTestId: integer('mock_test_id')
      .references(() => mockTests.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    sectionCode: text('section_code').notNull(),
    weight: real('weight').notNull().default(1),
  },
  (table) => [index('idx_mtq_mock').on(table.mockTestId)]
);

export const testAttempts = pgTable(
  'test_attempts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    mockTestId: integer('mock_test_id').references(() => mockTests.id),
    examCode: text('exam_code').notNull(),
    mode: text('mode').notNull().default('practice'),
    status: text('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    elapsedSec: integer('elapsed_sec').notNull().default(0),
    remainingSec: integer('remaining_sec').notNull().default(0),
    currentQuestionIndex: integer('current_question_index').notNull().default(0),
    overallScore: real('overall_score'),
    sectionScoresJson: jsonb('section_scores_json').$type<Record<string, number>>().default({}),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index('idx_attempts_user').on(table.userId, table.startedAt),
    index('idx_attempts_exam').on(table.examCode),
  ]
);

export const studentResponses = pgTable(
  'student_responses',
  {
    id: serial('id').primaryKey(),
    attemptId: integer('attempt_id')
      .references(() => testAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id')
      .references(() => questions.id, { onDelete: 'cascade' })
      .notNull(),
    answerJson: jsonb('answer_json').$type<Record<string, unknown>>().default({}),
    transcriptText: text('transcript_text'),
    audioMime: text('audio_mime'),
    audioDurationSec: real('audio_duration_sec'),
    isMarkedReview: boolean('is_marked_review').notNull().default(false),
    objectiveScore: real('objective_score'),
    maxScore: real('max_score'),
    isCorrect: boolean('is_correct'),
    timeSpentSec: integer('time_spent_sec').notNull().default(0),
    savedAt: timestamp('saved_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_responses_attempt').on(table.attemptId),
    uniqueIndex('uq_attempt_question').on(table.attemptId, table.questionId),
  ]
);

export const aiAssessments = pgTable(
  'ai_assessments',
  {
    id: serial('id').primaryKey(),
    responseId: integer('response_id').references(() => studentResponses.id, { onDelete: 'set null' }),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id').references(() => questions.id, { onDelete: 'set null' }),
    examCode: text('exam_code').notNull(),
    assessmentType: text('assessment_type').notNull(),
    provider: text('provider').notNull().default('gemini'),
    modelUsed: text('model_used').notNull().default('gemini-4-hydrogen'),
    overallScore: real('overall_score').notNull(),
    subscoresJson: jsonb('subscores_json').$type<Record<string, number>>().default({}),
    wordFeedbackJson: jsonb('word_feedback_json').$type<Array<Record<string, unknown>>>().default([]),
    grammarHighlightsJson: jsonb('grammar_highlights_json').$type<Array<Record<string, unknown>>>().default([]),
    suggestionsJson: jsonb('suggestions_json').$type<string[]>().default([]),
    improvedVersion: text('improved_version'),
    modelAnswer: text('model_answer'),
    rawFeedbackSummary: text('raw_feedback_summary').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_ai_assessments_user').on(table.userId, table.createdAt)]
);

export const studyPlans = pgTable(
  'study_plans',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    examCode: text('exam_code').notNull(),
    targetScore: text('target_score').notNull(),
    currentEstimatedScore: text('current_estimated_score').notNull(),
    examDate: text('exam_date'),
    weeklyHours: integer('weekly_hours').notNull().default(10),
    planJson: jsonb('plan_json').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_study_plans_user').on(table.userId)]
);

export const tutorMessages = pgTable(
  'tutor_messages',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    examCode: text('exam_code').notNull().default('pte_academic'),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_tutor_user').on(table.userId, table.createdAt)]
);

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  targetAudience: text('target_audience').notNull(),
  monthlyPriceUsd: real('monthly_price_usd').notNull(),
  quarterlyPriceUsd: real('quarterly_price_usd').notNull(),
  annualPriceUsd: real('annual_price_usd').notNull(),
  featuresJson: jsonb('features_json').$type<string[]>().default([]),
  limitsJson: jsonb('limits_json').$type<{ dailyPractice: number; dailyAiScoring: number; fullMocksPerMonth: number; seats: number }>().default({
    dailyPractice: 15,
    dailyAiScoring: 3,
    fullMocksPerMonth: 1,
    seats: 1,
  }),
  isActive: boolean('is_active').notNull().default(true),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: integer('organization_id').references(() => organizations.id),
    planId: integer('plan_id')
      .references(() => subscriptionPlans.id)
      .notNull(),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    status: text('status').notNull().default('active'),
    provider: text('provider').notNull().default('manual'),
    externalSubId: text('external_sub_id'),
    currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_subscriptions_user').on(table.userId)]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    subscriptionId: integer('subscription_id').references(() => subscriptions.id),
    provider: text('provider').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('pending'),
    providerRef: text('provider_ref'),
    invoiceNumber: text('invoice_number').notNull(),
    couponCode: text('coupon_code'),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_payments_user').on(table.userId)]
);

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull().default('percent'),
  discountValue: real('discount_value').notNull(),
  maxRedemptions: integer('max_redemptions').notNull().default(500),
  redeemedCount: integer('redeemed_count').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const assignments = pgTable(
  'assignments',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    assignedBy: integer('assigned_by').references(() => users.id),
    title: text('title').notNull(),
    examCode: text('exam_code').notNull(),
    mockTestId: integer('mock_test_id').references(() => mockTests.id),
    questionIdsJson: jsonb('question_ids_json').$type<number[]>().default([]),
    dueDate: text('due_date'),
    instructions: text('instructions').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_assignments_team').on(table.teamId)]
);

export const collaborativeSessions = pgTable(
  'collaborative_sessions',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    hostUserId: integer('host_user_id').references(() => users.id),
    title: text('title').notNull(),
    examCode: text('exam_code').notNull(),
    currentQuestionId: integer('current_question_id').references(() => questions.id),
    status: text('status').notNull().default('live'),
    roomCode: text('room_code').notNull().unique(),
    announcementsJson: jsonb('announcements_json').$type<Array<{ author: string; text: string; createdAt: string }>>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_collab_team').on(table.teamId)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    channel: text('channel').notNull().default('in_app'),
    category: text('category').notNull().default('system'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId, table.isRead)]
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventName: text('event_name').notNull(),
    examCode: text('exam_code'),
    propertiesJson: jsonb('properties_json').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_analytics_event').on(table.eventName, table.createdAt)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetEntity: text('target_entity').notNull(),
    targetId: text('target_id'),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_created').on(table.createdAt)]
);

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  attempts: many(testAttempts),
  aiAssessments: many(aiAssessments),
  notifications: many(notifications),
}));

export const testAttemptsRelations = relations(testAttempts, ({ one, many }) => ({
  user: one(users, { fields: [testAttempts.userId], references: [users.id] }),
  mockTest: one(mockTests, { fields: [testAttempts.mockTestId], references: [mockTests.id] }),
  responses: many(studentResponses),
}));
