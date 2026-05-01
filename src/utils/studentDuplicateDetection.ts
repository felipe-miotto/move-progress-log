export interface DuplicateStudentInput {
  id: string;
  name: string;
  birth_date?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  created_at?: string | null;
}

export type DuplicateStudentConfidence = "alta" | "media" | "baixa" | "conflito";

export interface DuplicateStudentCandidate {
  studentA: DuplicateStudentInput;
  studentB: DuplicateStudentInput;
  score: number;
  confidence: DuplicateStudentConfidence;
  reasons: string[];
  blockingReasons: string[];
}

const CONNECTOR_TOKENS = new Set(["da", "de", "do", "das", "dos", "e"]);

export const normalizeStudentName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getNameTokens = (value: string): string[] =>
  normalizeStudentName(value)
    .split(" ")
    .filter((token) => token.length > 0 && !CONNECTOR_TOKENS.has(token));

const withoutConnectors = (value: string): string => getNameTokens(value).join(" ");

const tokenJaccard = (a: string[], b: string[]): number => {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;

  let intersection = 0;
  union.forEach((token) => {
    if (setA.has(token) && setB.has(token)) intersection += 1;
  });

  return intersection / union.size;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
};

const normalizedEditSimilarity = (a: string, b: string): number => {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
};

const hasCompatibleMeasurement = (
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance: number
): boolean => {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
};

const scoreStudentPair = (
  studentA: DuplicateStudentInput,
  studentB: DuplicateStudentInput
): DuplicateStudentCandidate | null => {
  const normalizedA = normalizeStudentName(studentA.name);
  const normalizedB = normalizeStudentName(studentB.name);
  const compactA = withoutConnectors(studentA.name);
  const compactB = withoutConnectors(studentB.name);
  const tokensA = getNameTokens(studentA.name);
  const tokensB = getNameTokens(studentB.name);
  const reasons: string[] = [];
  const blockingReasons: string[] = [];

  let score = 0;

  if (normalizedA === normalizedB) {
    score = 1;
    reasons.push("Nome igual após normalização de acentos, caixa e espaços.");
  } else if (compactA.length > 0 && compactA === compactB) {
    score = 0.96;
    reasons.push("Nome equivalente ignorando conectores como de/da/do.");
  } else {
    const editSimilarity = normalizedEditSimilarity(normalizedA, normalizedB);
    const tokenSimilarity = tokenJaccard(tokensA, tokensB);
    const firstTokenMatch = tokensA[0] && tokensA[0] === tokensB[0];
    const firstTokenSimilarity =
      tokensA[0] && tokensB[0] ? normalizedEditSimilarity(tokensA[0], tokensB[0]) : 0;
    const lastTokenMatch =
      tokensA.length > 1 &&
      tokensB.length > 1 &&
      tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1];

    score = editSimilarity * 0.65 + tokenSimilarity * 0.35;

    if (firstTokenMatch) {
      score += 0.03;
      reasons.push("Primeiro nome igual.");
    }
    if (lastTokenMatch) {
      score += 0.03;
      reasons.push("Último sobrenome igual.");
    }
    if (!firstTokenMatch && lastTokenMatch && firstTokenSimilarity >= 0.84) {
      score += 0.16;
      reasons.push("Primeiro nome com grafia muito próxima e sobrenome igual.");
    }
    if (editSimilarity >= 0.86) {
      reasons.push("Grafia muito próxima.");
    }
    if (tokenSimilarity >= 0.7) {
      reasons.push("Alta sobreposição de nomes/sobrenomes.");
    }
  }

  if (studentA.birth_date && studentB.birth_date) {
    if (studentA.birth_date === studentB.birth_date) {
      score += 0.08;
      reasons.push("Mesma data de nascimento.");
    } else {
      score -= 0.25;
      blockingReasons.push("Datas de nascimento diferentes.");
    }
  }

  if (hasCompatibleMeasurement(studentA.height_cm, studentB.height_cm, 2)) {
    score += 0.02;
    reasons.push("Altura compatível.");
  }

  if (hasCompatibleMeasurement(studentA.weight_kg, studentB.weight_kg, 3)) {
    score += 0.02;
    reasons.push("Peso compatível.");
  }

  score = Math.max(0, Math.min(1, score));

  if (score < 0.82 && blockingReasons.length === 0) {
    return null;
  }

  let confidence: DuplicateStudentConfidence = "baixa";
  if (blockingReasons.length > 0) {
    confidence = "conflito";
  } else if (score >= 0.96) {
    confidence = "alta";
  } else if (score >= 0.88) {
    confidence = "media";
  }

  return {
    studentA,
    studentB,
    score,
    confidence,
    reasons,
    blockingReasons,
  };
};

export const findDuplicateStudentCandidates = (
  students: DuplicateStudentInput[],
  limit = 20
): DuplicateStudentCandidate[] => {
  const candidates: DuplicateStudentCandidate[] = [];

  for (let i = 0; i < students.length; i += 1) {
    for (let j = i + 1; j < students.length; j += 1) {
      const candidate = scoreStudentPair(students[i], students[j]);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates
    .sort((a, b) => {
      const confidenceOrder: Record<DuplicateStudentConfidence, number> = {
        alta: 4,
        media: 3,
        baixa: 2,
        conflito: 1,
      };

      return (
        confidenceOrder[b.confidence] - confidenceOrder[a.confidence] ||
        b.score - a.score ||
        a.studentA.name.localeCompare(b.studentA.name)
      );
    })
    .slice(0, limit);
};
