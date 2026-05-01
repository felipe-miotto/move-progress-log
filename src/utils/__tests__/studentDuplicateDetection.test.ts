import { describe, expect, it } from "vitest";
import {
  findDuplicateStudentCandidates,
  normalizeStudentName,
} from "../studentDuplicateDetection";

describe("studentDuplicateDetection", () => {
  it("normalizes accents, case and spacing", () => {
    expect(normalizeStudentName("  João   DA   Silva ")).toBe("joao da silva");
  });

  it("flags equivalent names with accents as high confidence", () => {
    const [candidate] = findDuplicateStudentCandidates([
      { id: "1", name: "Isabele Avelar", birth_date: "1975-01-01" },
      { id: "2", name: "Isabéle Avelar", birth_date: "1975-01-01" },
    ]);

    expect(candidate.confidence).toBe("alta");
    expect(candidate.score).toBeGreaterThanOrEqual(0.96);
  });

  it("flags very close spellings as review candidates", () => {
    const [candidate] = findDuplicateStudentCandidates([
      { id: "1", name: "Isabele Avelar" },
      { id: "2", name: "Isabelle Avelar" },
    ]);

    expect(candidate.confidence).toMatch(/alta|media/);
    expect(candidate.reasons.length).toBeGreaterThan(0);
  });

  it("does not flag names that only partially overlap", () => {
    const candidates = findDuplicateStudentCandidates([
      { id: "1", name: "Ana Silva" },
      { id: "2", name: "Ana Clara Silva" },
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("marks same-looking names with different birth dates as conflict", () => {
    const [candidate] = findDuplicateStudentCandidates([
      { id: "1", name: "Maria Santos", birth_date: "1970-01-01" },
      { id: "2", name: "Maria Santos", birth_date: "1980-01-01" },
    ]);

    expect(candidate.confidence).toBe("conflito");
    expect(candidate.blockingReasons).toContain("Datas de nascimento diferentes.");
  });
});
