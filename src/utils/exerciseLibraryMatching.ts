export interface ExerciseLibraryMatch {
  id: string;
  name: string;
}

export type ExerciseLibraryMatchMap = Map<string, ExerciseLibraryMatch>;

export const normalizeExerciseLibraryMatchName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildUniqueExerciseLibraryMatchMap = (
  rows: Array<{ id?: string | null; name?: string | null }>
): ExerciseLibraryMatchMap => {
  const buckets = new Map<string, ExerciseLibraryMatch[]>();

  for (const row of rows) {
    if (!row.id || !row.name) continue;
    const normalizedName = normalizeExerciseLibraryMatchName(row.name);
    if (!normalizedName) continue;

    const current = buckets.get(normalizedName) || [];
    current.push({ id: row.id, name: row.name });
    buckets.set(normalizedName, current);
  }

  const uniqueMatches: ExerciseLibraryMatchMap = new Map();
  for (const [normalizedName, matches] of buckets.entries()) {
    if (matches.length === 1) {
      uniqueMatches.set(normalizedName, matches[0]);
    }
  }

  return uniqueMatches;
};

export const resolveExerciseLibraryIdByName = (
  exerciseName: string,
  matchMap: ExerciseLibraryMatchMap
): string | null => {
  const normalizedName = normalizeExerciseLibraryMatchName(exerciseName);
  if (!normalizedName) return null;
  return matchMap.get(normalizedName)?.id ?? null;
};
