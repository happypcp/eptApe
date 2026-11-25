import { scalePercentageToExamScore } from '../shared/examSpecs.ts';

export interface ObjectiveGradeResult {
  score: number;
  maxScore: number;
  isCorrect: boolean;
  accuracyPct: number;
  breakdown: Array<{
    label: string;
    expected: string;
    submitted: string;
    correct: boolean;
    points: number;
  }>;
  mistakeSummary: string;
}

function normalizeToken(val: string): string {
  return val
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s-]/g, '')
    .trim();
}

function matchesWithVariants(submitted: string, expected: string, variants: string[] = []): boolean {
  const normSub = normalizeToken(submitted);
  if (!normSub) return false;
  const accepted = [expected, ...variants].map(normalizeToken);
  return accepted.includes(normSub);
}

export function gradeObjectiveQuestion(params: {
  examCode: string;
  typeCode: string;
  answerKey: Record<string, unknown>;
  acceptedVariants?: string[];
  submittedAnswer: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
}): ObjectiveGradeResult {
  const { examCode, typeCode, answerKey, acceptedVariants = [], submittedAnswer, scoringConfig = {} } = params;
  const negativeMarking =
    Boolean(scoringConfig.negativeMarking) ||
    typeCode === 'mc_multiple_reading' ||
    typeCode === 'mc_multiple_listening' ||
    typeCode === 'highlight_incorrect_words';

  // 1. Multiple Choice Single Answer / TFNG / YNNG / Highlight Correct Summary / Select Missing Word
  if (typeof answerKey.correctOption === 'string') {
    const submitted = String(submittedAnswer.selectedOption || '');
    const correct = submitted.trim().toLowerCase() === answerKey.correctOption.trim().toLowerCase();
    return {
      score: correct ? 1 : 0,
      maxScore: 1,
      isCorrect: correct,
      accuracyPct: correct ? 100 : 0,
      breakdown: [
        {
          label: 'Selected Response',
          expected: answerKey.correctOption,
          submitted: submitted || '(No selection)',
          correct,
          points: correct ? 1 : 0,
        },
      ],
      mistakeSummary: correct
        ? 'Exact match with the verified answer key.'
        : `Expected "${answerKey.correctOption}" instead of "${submitted || 'blank'}".`,
    };
  }

  // 2. Multiple Choice Multiple Answers (supports PTE +1/-1 floor 0 or IELTS/DET partial credit)
  if (Array.isArray(answerKey.correctOptions)) {
    const expectedSet = new Set((answerKey.correctOptions as string[]).map((s) => s.trim()));
    const submittedArr = Array.isArray(submittedAnswer.selectedOptions)
      ? (submittedAnswer.selectedOptions as string[]).map((s) => s.trim())
      : [];
    const submittedSet = new Set(submittedArr);
    const maxScore = expectedSet.size;
    let rawPoints = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];

    for (const opt of submittedSet) {
      if (expectedSet.has(opt)) {
        rawPoints += 1;
        breakdown.push({ label: `Option ${opt}`, expected: opt, submitted: opt, correct: true, points: 1 });
      } else {
        const penalty = negativeMarking ? -1 : 0;
        rawPoints += penalty;
        breakdown.push({
          label: `Extra Option ${opt}`,
          expected: 'Not selected',
          submitted: opt,
          correct: false,
          points: penalty,
        });
      }
    }
    for (const exp of expectedSet) {
      if (!submittedSet.has(exp)) {
        breakdown.push({ label: `Missed Option ${exp}`, expected: exp, submitted: '(Missed)', correct: false, points: 0 });
      }
    }

    const score = Math.max(0, rawPoints);
    const accuracyPct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return {
      score,
      maxScore,
      isCorrect: score === maxScore && submittedSet.size === expectedSet.size,
      accuracyPct,
      breakdown,
      mistakeSummary:
        score === maxScore
          ? 'All correct options identified with zero false positives.'
          : negativeMarking
          ? `Scored ${score}/${maxScore} with PTE negative marking applied for incorrect selections.`
          : `Scored ${score}/${maxScore} partial credit.`,
    };
  }

  // 3. Re-order Paragraphs (PTE Adjacent Pair Scoring)
  if (Array.isArray(answerKey.correctOrder)) {
    const correctOrder = answerKey.correctOrder as string[];
    const submittedOrder = Array.isArray(submittedAnswer.order) ? (submittedAnswer.order as string[]) : [];
    const maxScore = Math.max(1, correctOrder.length - 1);
    const validPairs = new Set<string>();
    for (let i = 0; i < correctOrder.length - 1; i++) {
      validPairs.add(`${correctOrder[i]}->${correctOrder[i + 1]}`);
    }

    let score = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];
    for (let i = 0; i < submittedOrder.length - 1; i++) {
      const pair = `${submittedOrder[i]}->${submittedOrder[i + 1]}`;
      const matched = validPairs.has(pair);
      if (matched) score += 1;
      breakdown.push({
        label: `Pair ${i + 1}`,
        expected: matched ? pair : 'Adjacent logical link',
        submitted: pair,
        correct: matched,
        points: matched ? 1 : 0,
      });
    }

    const accuracyPct = Math.round((score / maxScore) * 100);
    return {
      score,
      maxScore,
      isCorrect: score === maxScore,
      accuracyPct,
      breakdown,
      mistakeSummary:
        score === maxScore
          ? `Perfect sequence: all ${maxScore} adjacent paragraph pairs match.`
          : `Matched ${score} of ${maxScore} adjacent pairs. Review transition connectors and pronoun antecedents.`,
    };
  }

  // 4. Fill in the Blanks (Dropdown, Input, C-Test, Matching Pairs)
  if (answerKey.blanks && typeof answerKey.blanks === 'object') {
    const expectedBlanks = answerKey.blanks as Record<string, string | string[]>;
    const submittedBlanks = (submittedAnswer.blanks || {}) as Record<string, string>;
    const keys = Object.keys(expectedBlanks);
    const maxScore = keys.length;
    let score = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];

    for (const key of keys) {
      const expVal = expectedBlanks[key];
      const primary = Array.isArray(expVal) ? expVal[0] : expVal;
      const variants = Array.isArray(expVal) ? expVal.slice(1) : acceptedVariants;
      const sub = String(submittedBlanks[key] || '');
      const correct = matchesWithVariants(sub, primary, variants);
      if (correct) score += 1;
      breakdown.push({
        label: `Blank ${key}`,
        expected: primary,
        submitted: sub || '(Empty)',
        correct,
        points: correct ? 1 : 0,
      });
    }

    const accuracyPct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return {
      score,
      maxScore,
      isCorrect: score === maxScore,
      accuracyPct,
      breakdown,
      mistakeSummary:
        score === maxScore
          ? `All ${maxScore} blanks completed accurately.`
          : `${score}/${maxScore} blanks correct. Check collocations and spelling on missed gaps.`,
    };
  }

  // 5. Highlight Incorrect Words (PTE +1 / -1 floor 0)
  if (Array.isArray(answerKey.incorrectWordIndices)) {
    const expectedIdx = new Set(answerKey.incorrectWordIndices as number[]);
    const submittedIdx = new Set(
      Array.isArray(submittedAnswer.selectedIndices) ? (submittedAnswer.selectedIndices as number[]) : []
    );
    const maxScore = expectedIdx.size;
    let rawPoints = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];

    for (const idx of submittedIdx) {
      if (expectedIdx.has(idx)) {
        rawPoints += 1;
        breakdown.push({ label: `Word #${idx + 1}`, expected: 'Incorrect word', submitted: 'Highlighted', correct: true, points: 1 });
      } else {
        rawPoints -= 1;
        breakdown.push({
          label: `Word #${idx + 1}`,
          expected: 'Matches audio',
          submitted: 'False positive',
          correct: false,
          points: -1,
        });
      }
    }
    for (const idx of expectedIdx) {
      if (!submittedIdx.has(idx)) {
        breakdown.push({ label: `Word #${idx + 1}`, expected: 'Should highlight', submitted: 'Missed', correct: false, points: 0 });
      }
    }
    const score = Math.max(0, rawPoints);
    return {
      score,
      maxScore,
      isCorrect: score === maxScore && submittedIdx.size === expectedIdx.size,
      accuracyPct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
      breakdown,
      mistakeSummary: `Identified ${score}/${maxScore} substituted words after negative-marking adjustment.`,
    };
  }

  // 6. Write From Dictation / Listen and Type (Word-by-Word exact matching)
  if (typeof answerKey.referenceSentence === 'string') {
    const refWords = normalizeToken(answerKey.referenceSentence).split(/\s+/).filter(Boolean);
    const subWords = normalizeToken(String(submittedAnswer.text || '')).split(/\s+/).filter(Boolean);
    const subCounts = new Map<string, number>();
    for (const w of subWords) {
      subCounts.set(w, (subCounts.get(w) || 0) + 1);
    }

    let matched = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];
    for (const ref of refWords) {
      const avail = subCounts.get(ref) || 0;
      if (avail > 0) {
        matched += 1;
        subCounts.set(ref, avail - 1);
        breakdown.push({ label: ref, expected: ref, submitted: ref, correct: true, points: 1 });
      } else {
        breakdown.push({ label: ref, expected: ref, submitted: '(Missing/Misspelled)', correct: false, points: 0 });
      }
    }
    const maxScore = refWords.length;
    const accuracyPct = maxScore > 0 ? Math.round((matched / maxScore) * 100) : 0;
    return {
      score: matched,
      maxScore,
      isCorrect: matched === maxScore && subWords.length === refWords.length,
      accuracyPct,
      breakdown,
      mistakeSummary:
        matched === maxScore
          ? `All ${maxScore} dictated words matched accurately.`
          : `Matched ${matched} of ${maxScore} words. Review singular/plural endings and articles.`,
    };
  }

  // 7. DET Read and Select (Real English words vs Pseudo-words)
  if (Array.isArray(answerKey.realWords)) {
    const realSet = new Set((answerKey.realWords as string[]).map((w) => w.toLowerCase()));
    const allWords = Array.isArray(answerKey.allWords) ? (answerKey.allWords as string[]) : Array.from(realSet);
    const selectedSet = new Set(
      (Array.isArray(submittedAnswer.selectedWords) ? (submittedAnswer.selectedWords as string[]) : []).map((w) =>
        w.toLowerCase()
      )
    );
    const maxScore = allWords.length;
    let score = 0;
    const breakdown: ObjectiveGradeResult['breakdown'] = [];
    for (const word of allWords) {
      const lower = word.toLowerCase();
      const isReal = realSet.has(lower);
      const userSelected = selectedSet.has(lower);
      const correct = isReal === userSelected;
      if (correct) score += 1;
      breakdown.push({
        label: word,
        expected: isReal ? 'Real word' : 'Pseudo-word',
        submitted: userSelected ? 'Selected' : 'Rejected',
        correct,
        points: correct ? 1 : 0,
      });
    }
    return {
      score,
      maxScore,
      isCorrect: score === maxScore,
      accuracyPct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
      breakdown,
      mistakeSummary: `Classified ${score}/${maxScore} lexical items accurately (${examCode.toUpperCase()}).`,
    };
  }

  return {
    score: 0,
    maxScore: 1,
    isCorrect: false,
    accuracyPct: 0,
    breakdown: [],
    mistakeSummary: 'No objective answer key configured for this question.',
  };
}

export function computeAttemptScoreSummary(
  examCode: string,
  sectionTallies: Record<string, { earned: number; max: number }>
): { overallScore: number; sectionScores: Record<string, number> } {
  const sectionScores: Record<string, number> = {};
  let totalPctSum = 0;
  let count = 0;

  for (const [sec, tally] of Object.entries(sectionTallies)) {
    if (tally.max > 0) {
      const pct = Math.max(0, Math.min(1, tally.earned / tally.max));
      sectionScores[sec] = scalePercentageToExamScore(examCode, pct);
      totalPctSum += pct;
      count += 1;
    }
  }

  const avgPct = count > 0 ? totalPctSum / count : 0;
  const overallScore = scalePercentageToExamScore(examCode, avgPct);
  return { overallScore, sectionScores };
}
