import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'crypto';
import { EXAM_SPECS, ExamCode } from '../shared/examSpecs.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server. Configure it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Server-side audio cache (keyed by hash of text+voice+mode) so TTS clips replay rapidly without extra API calls
const ttsCache = new Map<string, { base64Audio: string; mimeType: string; createdAt: number }>();

function wrapPcmAsWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function normalizePlayableAudio(base64Data: string, rawMimeType?: string): { base64Audio: string; mimeType: string } {
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length < 4) {
    throw new Error('TTS engine returned an empty audio buffer.');
  }

  const head4 = buf.subarray(0, 4).toString('ascii');
  if (head4 === 'RIFF') {
    return { base64Audio: base64Data, mimeType: 'audio/wav' };
  }
  if (head4 === 'OggS') {
    return { base64Audio: base64Data, mimeType: 'audio/ogg' };
  }
  if (head4 === 'fLaC') {
    return { base64Audio: base64Data, mimeType: 'audio/flac' };
  }
  if (head4.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { base64Audio: base64Data, mimeType: 'audio/mpeg' };
  }

  // Raw PCM (e.g. audio/L16;codec=pcm;rate=24000) -> wrap in standard 44-byte RIFF/WAVE header
  const rateMatch = rawMimeType?.match(/rate=(\d+)/i);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const wavBuf = wrapPcmAsWav(buf, sampleRate, 1, 16);
  return { base64Audio: wavBuf.toString('base64'), mimeType: 'audio/wav' };
}

export interface SpeakingEvaluationInput {
  examCode: ExamCode;
  typeCode: string;
  taskName: string;
  promptText: string;
  referenceText?: string;
  audioBase64?: string;
  audioMime?: string;
  manualTranscript?: string;
  durationSec: number;
}

export interface SpeakingEvaluationResult {
  provider: string;
  modelUsed: string;
  transcript: string;
  overallScore: number;
  scoreUnit: string;
  subscores: {
    pronunciation: number;
    fluency: number;
    content: number;
    grammar: number;
    vocabulary: number;
  };
  metrics: {
    wordsPerMinute: number;
    pauseCount: number;
    hesitationCount: number;
    repetitionCount: number;
    completenessPct: number;
    audioQualityLabel: string;
  };
  wordFeedback: Array<{
    word: string;
    status: 'correct' | 'mispronounced' | 'omitted' | 'inserted';
    note?: string;
  }>;
  missingWords: string[];
  improvements: string[];
  suggestedExercises: string[];
  summary: string;
  disclaimer: string;
}

export interface WritingEvaluationInput {
  examCode: ExamCode;
  typeCode: string;
  taskName: string;
  promptText: string;
  stimulusText?: string;
  essayText: string;
  minWords?: number;
  maxWords?: number;
}

export interface WritingEvaluationResult {
  provider: string;
  modelUsed: string;
  overallScore: number;
  scoreUnit: string;
  wordCount: number;
  criteriaScores: Array<{
    criterion: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  grammarErrors: Array<{
    original: string;
    correction: string;
    category: string;
    reason: string;
  }>;
  vocabularySuggestions: Array<{
    original: string;
    upgrade: string;
    contextNote: string;
  }>;
  sentenceImprovements: Array<{
    original: string;
    improved: string;
    why: string;
  }>;
  improvedVersion: string;
  modelAnswer: string;
  feedbackSummary: string;
  disclaimer: string;
}

export async function transcribeAudioBuffer(audioBase64: string, mimeType = 'audio/webm'): Promise<string> {
  const ai = getGeminiClient();
  const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Transcribe this English speaking test recording verbatim. Preserve hesitations (um, uh), false starts, and repetitions accurately so fluency can be evaluated. Return only the spoken transcript.',
        },
      ],
    },
  });
  return (response.text || '').trim();
}

export async function evaluateSpeakingResponse(input: SpeakingEvaluationInput): Promise<SpeakingEvaluationResult> {
  const ai = getGeminiClient();
  const spec = EXAM_SPECS[input.examCode] || EXAM_SPECS.pte_academic;

  let transcript = (input.manualTranscript || '').trim();
  if (input.audioBase64) {
    transcript = await transcribeAudioBuffer(input.audioBase64, input.audioMime || 'audio/webm');
  }

  if (!transcript) {
    throw new Error('No intelligible speech was detected in the recording. Please check your microphone and speak clearly.');
  }

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const safeDuration = Math.max(3, input.durationSec || Math.round(wordCount / 2.2));
  const computedWpm = Math.round((wordCount / safeDuration) * 60);

  const scaleGuide =
    input.examCode === 'ielts_academic' || input.examCode === 'ielts_general'
      ? 'Score strictly on the IELTS 0.0 to 9.0 Band Scale in 0.5 increments (e.g., 6.0, 6.5, 7.0, 7.5). Map subscores to IELTS descriptors.'
      : input.examCode === 'det'
      ? 'Score strictly on the Duolingo English Test 10 to 160 scale in 5-point increments (e.g., 105, 115, 125).'
      : 'Score strictly on the Pearson PTE 10 to 90 Global Scale of English (integer values 10–90).';

  const systemInstruction = `You are a senior English proficiency examiner calibrating practice feedback for ${spec.name} (${spec.versionTag}).
${scaleGuide}
Evaluate the candidate's spoken transcript objectively against the task prompt and reference text (if provided).
Be honest, specific, and diagnostic — never inflate scores for empty, off-topic, or heavily truncated responses.
Also analyze word-by-word alignment against reference text when applicable, marking words as "correct", "mispronounced", "omitted", or "inserted".`;

  const userPrompt = `Exam: ${spec.name}
Task Type: ${input.taskName} (${input.typeCode})
Task Prompt: ${input.promptText}
${input.referenceText ? `Reference Passage / Expected Content:\n${input.referenceText}\n` : ''}
Recording Duration: ${safeDuration} seconds (Measured speaking speed: ~${computedWpm} WPM)
Candidate Verbatim Transcript:
"""
${transcript}
"""

Provide a complete, calibrated speaking diagnostic report in strict JSON format.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER },
          pronunciation: { type: Type.NUMBER },
          fluency: { type: Type.NUMBER },
          content: { type: Type.NUMBER },
          grammar: { type: Type.NUMBER },
          vocabulary: { type: Type.NUMBER },
          pauseCount: { type: Type.INTEGER },
          hesitationCount: { type: Type.INTEGER },
          repetitionCount: { type: Type.INTEGER },
          completenessPct: { type: Type.INTEGER },
          audioQualityLabel: { type: Type.STRING },
          wordFeedback: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                status: { type: Type.STRING },
                note: { type: Type.STRING },
              },
            },
          },
          missingWords: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedExercises: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim());

  const clampScale = (val: number) => {
    const n = Number(val) || spec.scoreScaleMin;
    const bounded = Math.max(spec.scoreScaleMin, Math.min(spec.scoreScaleMax, n));
    if (spec.scoreStep === 0.5) return Math.round(bounded * 2) / 2;
    if (spec.scoreStep === 5) return Math.round(bounded / 5) * 5;
    return Math.round(bounded);
  };

  return {
    provider: 'gemini',
    modelUsed: 'gemini-3.5-transcribe + gemini-4-hydrogen',
    transcript,
    overallScore: clampScale(parsed.overallScore),
    scoreUnit: spec.scoreUnit,
    subscores: {
      pronunciation: clampScale(parsed.pronunciation),
      fluency: clampScale(parsed.fluency),
      content: clampScale(parsed.content),
      grammar: clampScale(parsed.grammar),
      vocabulary: clampScale(parsed.vocabulary),
    },
    metrics: {
      wordsPerMinute: computedWpm,
      pauseCount: Number(parsed.pauseCount) || 0,
      hesitationCount: Number(parsed.hesitationCount) || 0,
      repetitionCount: Number(parsed.repetitionCount) || 0,
      completenessPct: Math.max(0, Math.min(100, Number(parsed.completenessPct) || 75)),
      audioQualityLabel: parsed.audioQualityLabel || 'Clear Input',
    },
    wordFeedback: Array.isArray(parsed.wordFeedback) ? parsed.wordFeedback.slice(0, 80) : [],
    missingWords: Array.isArray(parsed.missingWords) ? parsed.missingWords.slice(0, 20) : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    suggestedExercises: Array.isArray(parsed.suggestedExercises) ? parsed.suggestedExercises : [],
    summary: parsed.summary || 'Speaking evaluation complete.',
    disclaimer: spec.disclaimer,
  };
}

export async function evaluateWritingResponse(input: WritingEvaluationInput): Promise<WritingEvaluationResult> {
  const ai = getGeminiClient();
  const spec = EXAM_SPECS[input.examCode] || EXAM_SPECS.pte_academic;
  const words = input.essayText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 5) {
    throw new Error('Please write at least 5 words before requesting an AI writing evaluation.');
  }

  const criteriaGuide =
    input.examCode === 'ielts_academic' || input.examCode === 'ielts_general'
      ? 'Evaluate strictly on IELTS 0.0–9.0 Band Scale (0.5 steps) using the 4 official criteria: Task Achievement/Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.'
      : input.examCode === 'det'
      ? 'Evaluate strictly on the Duolingo English Test 10–160 scale (5-point steps) covering Literacy, Production, Grammatical Accuracy, Lexical Sophistication, and Task Relevance.'
      : 'Evaluate strictly on the Pearson PTE 10–90 Global Scale covering Content, Form (word count compliance), Grammar, Vocabulary, Spelling, and Written Discourse.';

  const systemInstruction = `You are a certified English writing examiner for ${spec.name} (${spec.versionTag}).
${criteriaGuide}
Provide precise, actionable error highlights referencing exact substrings from the candidate's response, lexical upgrades, sentence rewrites, an improved version preserving the candidate's ideas at a high score tier, and a fresh original high-scoring model answer.`;

  const userPrompt = `Exam: ${spec.name}
Task: ${input.taskName} (${input.typeCode})
Prompt: ${input.promptText}
${input.stimulusText ? `Source Passage / Context:\n${input.stimulusText}\n` : ''}
Target Word Range: ${input.minWords || 50}–${input.maxWords || 300} words (Candidate wrote ${wordCount} words)

Candidate Response:
"""
${input.essayText}
"""

Return a strict JSON diagnostic writing report.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER },
          criteriaScores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                score: { type: Type.NUMBER },
                maxScore: { type: Type.NUMBER },
                comment: { type: Type.STRING },
              },
            },
          },
          grammarErrors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                correction: { type: Type.STRING },
                category: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
          vocabularySuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                upgrade: { type: Type.STRING },
                contextNote: { type: Type.STRING },
              },
            },
          },
          sentenceImprovements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                improved: { type: Type.STRING },
                why: { type: Type.STRING },
              },
            },
          },
          improvedVersion: { type: Type.STRING },
          modelAnswer: { type: Type.STRING },
          feedbackSummary: { type: Type.STRING },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim());
  const rawScore = Number(parsed.overallScore) || spec.scoreScaleMin;
  const bounded = Math.max(spec.scoreScaleMin, Math.min(spec.scoreScaleMax, rawScore));
  const overallScore =
    spec.scoreStep === 0.5
      ? Math.round(bounded * 2) / 2
      : spec.scoreStep === 5
      ? Math.round(bounded / 5) * 5
      : Math.round(bounded);

  return {
    provider: 'gemini',
    modelUsed: 'gemini-4-hydrogen',
    overallScore,
    scoreUnit: spec.scoreUnit,
    wordCount,
    criteriaScores: Array.isArray(parsed.criteriaScores) ? parsed.criteriaScores : [],
    grammarErrors: Array.isArray(parsed.grammarErrors) ? parsed.grammarErrors : [],
    vocabularySuggestions: Array.isArray(parsed.vocabularySuggestions) ? parsed.vocabularySuggestions : [],
    sentenceImprovements: Array.isArray(parsed.sentenceImprovements) ? parsed.sentenceImprovements : [],
    improvedVersion: parsed.improvedVersion || '',
    modelAnswer: parsed.modelAnswer || '',
    feedbackSummary: parsed.feedbackSummary || 'Writing evaluation completed.',
    disclaimer: spec.disclaimer,
  };
}

export async function synthesizeExamAudio(params: {
  text: string;
  voiceName?: string;
  style?: string;
  multiSpeaker?: Array<{ speaker: string; text: string; voiceName?: string; style?: string }>;
}): Promise<{ base64Audio: string; mimeType: string; cached: boolean }> {
  const hashKey = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');

  const hit = ttsCache.get(hashKey);
  if (hit) {
    return { base64Audio: hit.base64Audio, mimeType: hit.mimeType, cached: true };
  }

  const ai = getGeminiClient();

  if (params.multiSpeaker && params.multiSpeaker.length >= 2) {
    const speakers = Array.from(new Set(params.multiSpeaker.map((s) => s.speaker))).slice(0, 2);
    const voices = ['Puck', 'Kore'];
    const parts = params.multiSpeaker.map((turn) => ({
      text: `${turn.speaker}: ${turn.text}`,
      speechMetadata: {
        speaker: turn.speaker,
        style: turn.style || 'Clear, natural academic seminar speaker',
      },
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: speakers.map((spk, idx) => ({
              speaker: spk,
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voices[idx % voices.length] },
              },
            })),
          },
        },
      },
    });

    const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) {
      throw new Error('TTS engine did not return audio data.');
    }
    const normalized = normalizePlayableAudio(inline.data, inline.mimeType);
    ttsCache.set(hashKey, { ...normalized, createdAt: Date.now() });
    return { ...normalized, cached: false };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: params.style || 'Clear, measured academic examination narrator',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: params.voiceName || 'Kore' },
        },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error('TTS engine did not return audio data.');
  }

  const normalized = normalizePlayableAudio(inline.data, inline.mimeType);
  if (ttsCache.size > 120) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  ttsCache.set(hashKey, { ...normalized, createdAt: Date.now() });
  return { ...normalized, cached: false };
}

export async function generateTutorReply(params: {
  examCode: ExamCode;
  message: string;
  history: Array<{ role: string; content: string }>;
  studentContext: {
    targetScore: string;
    recentWeakTypes: string[];
    averageScore: string;
  };
}): Promise<string> {
  const ai = getGeminiClient();
  const spec = EXAM_SPECS[params.examCode] || EXAM_SPECS.pte_academic;

  const systemInstruction = `You are LexiScore's AI Personal English Tutor specializing in ${spec.name} (${spec.versionTag}).
Student Context:
- Target Score: ${params.studentContext.targetScore} (${spec.scoreUnit})
- Current Average Estimate: ${params.studentContext.averageScore}
- Recent Weak Question Types: ${params.studentContext.recentWeakTypes.join(', ') || 'None recorded yet'}

Give clear, structured, actionable coaching tailored strictly to ${spec.name}'s official format and rubric. Include concrete examples, grammar/vocabulary upgrades, and targeted practice exercises. Never claim estimates are official Pearson/IELTS/Duolingo certifications.`;

  const historyLines = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${historyLines ? `Previous Conversation:\n${historyLines}\n\n` : ''}Student: ${params.message}`,
    config: {
      systemInstruction,
    },
  });

  return (response.text || 'I could not generate a response right now. Please try again.').trim();
}

export async function generatePersonalizedStudyPlan(params: {
  examCode: ExamCode;
  targetScore: string;
  currentEstimatedScore: string;
  examDate?: string;
  weeklyHours: number;
  weakAreas: string[];
}): Promise<Record<string, unknown>> {
  const ai = getGeminiClient();
  const spec = EXAM_SPECS[params.examCode] || EXAM_SPECS.pte_academic;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Create a personalized study plan for ${spec.name}.
Target Score: ${params.targetScore} (${spec.scoreUnit})
Current Estimated Score: ${params.currentEstimatedScore}
Target Exam Date: ${params.examDate || '4 weeks from today'}
Weekly Study Commitment: ${params.weeklyHours} hours/week
Identified Weaknesses: ${params.weakAreas.join(', ') || 'Balanced across all 4 skills'}

Return a structured JSON plan with overview, priorityFocus, weeklySchedule (7 days), and milestoneCheckpoints.`,
    config: {
      systemInstruction: `You are an expert ${spec.name} curriculum architect. Build realistic, high-yield study schedules tied directly to ${spec.name}'s actual question types.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: { type: Type.STRING },
          priorityFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
          dailyTargetMinutes: { type: Type.INTEGER },
          weeklySchedule: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                focusSkill: { type: Type.STRING },
                durationMinutes: { type: Type.INTEGER },
                tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
          milestoneCheckpoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                week: { type: Type.STRING },
                goal: { type: Type.STRING },
                mockRecommended: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  return JSON.parse((response.text || '{}').trim());
}
