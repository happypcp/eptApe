export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LexiScore English Proficiency SaaS API',
      version: '1.0.0',
      description:
        'Modular REST API for LexiScore supporting PTE Academic, PTE Core, IELTS Academic, IELTS General Training, and Duolingo English Test mock exams, AI speaking/writing assessment, teams, billing, and administration.',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Firebase ID Token (JWT)',
        },
      },
    },
    paths: {
      '/api/exams': { get: { summary: 'List all supported versioned English exams and task specifications' } },
      '/api/questions': { get: { summary: 'Query published question bank filtered by exam, section, type, difficulty, and search' } },
      '/api/mock-tests': { get: { summary: 'List full-length and sectional mock tests for an exam' } },
      '/api/me': {
        get: { summary: 'Retrieve authenticated user profile, role, active subscription, and unread notifications', security: [{ BearerAuth: [] }] },
        patch: { summary: 'Update profile preferences, target exam, target score, and notification settings', security: [{ BearerAuth: [] }] },
      },
      '/api/attempts': {
        get: { summary: 'List authenticated user test attempts including resumable in-progress sessions', security: [{ BearerAuth: [] }] },
        post: { summary: 'Start a full-length, sectional, adaptive, or practice attempt', security: [{ BearerAuth: [] }] },
      },
      '/api/attempts/{id}/save': {
        patch: { summary: 'Auto-save question responses, review flags, and remaining timer state', security: [{ BearerAuth: [] }] },
      },
      '/api/attempts/{id}/submit': {
        post: { summary: 'Finalize attempt, run objective grading engine, and compute exam-native section and overall scores', security: [{ BearerAuth: [] }] },
      },
      '/api/ai/evaluate-speaking': {
        post: { summary: 'Transcribe browser microphone audio and score against exam-specific speaking rubrics', security: [{ BearerAuth: [] }] },
      },
      '/api/ai/evaluate-writing': {
        post: { summary: 'Evaluate essay/summary/email/letter against exam-specific writing criteria with error highlights and model answer', security: [{ BearerAuth: [] }] },
      },
      '/api/ai/tts': {
        post: { summary: 'Generate single-speaker or dual-speaker listening exam audio via Gemini TTS with server-side caching' },
      },
      '/api/ai/tutor': {
        get: { summary: 'Fetch AI Personal Tutor conversation history', security: [{ BearerAuth: [] }] },
        post: { summary: 'Send a prompt to the exam-aware AI Personal Tutor', security: [{ BearerAuth: [] }] },
      },
      '/api/ai/study-plan': {
        get: { summary: 'Fetch latest personalized AI study plan', security: [{ BearerAuth: [] }] },
        post: { summary: 'Generate a customized weekly AI study schedule based on weaknesses and target score', security: [{ BearerAuth: [] }] },
      },
      '/api/billing/status': { get: { summary: 'Fetch subscription plans, user active plan, payment history, and gateway status' } },
      '/api/billing/checkout': { post: { summary: 'Initiate server-verified Stripe, Khalti, or eSewa checkout', security: [{ BearerAuth: [] }] } },
      '/api/teams': {
        get: { summary: 'List organizations, teams, assignments, and live collaborative sessions', security: [{ BearerAuth: [] }] },
        post: { summary: 'Create an organization or study team', security: [{ BearerAuth: [] }] },
      },
      '/api/admin/overview': {
        get: { summary: 'Super Admin / Admin platform statistics, AI consumption, and audit logs', security: [{ BearerAuth: [] }] },
      },
      '/api/admin/questions/bulk-import': {
        post: { summary: 'Bulk import CSV/JSON questions with duplicate detection', security: [{ BearerAuth: [] }] },
      },
    },
  };
}
