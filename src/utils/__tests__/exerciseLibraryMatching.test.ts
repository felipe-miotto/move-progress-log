import { describe, expect, it } from "vitest";
import {
  buildUniqueExerciseLibraryMatchMap,
  normalizeExerciseLibraryMatchName,
  resolveExerciseLibraryIdByName,
} from "../exerciseLibraryMatching";

describe("exerciseLibraryMatching", () => {
  it("normalizes accents, punctuation, casing and spacing without concatenating words", () => {
    expect(normalizeExerciseLibraryMatchName(" Supino Reto (Barra) ")).toBe("supino reto barra");
    expect(normalizeExerciseLibraryMatchName("Agachamento-Sumô/barra")).toBe("agachamento sumo barra");
  });

  it("maps only unique normalized library names", () => {
    const map = buildUniqueExerciseLibraryMatchMap([
      { id: "unique-1", name: "Kettlebell Swing" },
      { id: "duplicate-1", name: "Supino Reto Barra" },
      { id: "duplicate-2", name: "supino-reto/barra" },
      { id: "empty-name", name: "" },
      { id: null, name: "Sem ID" },
    ]);

    expect(resolveExerciseLibraryIdByName("kettlebell swing", map)).toBe("unique-1");
    expect(resolveExerciseLibraryIdByName("Supino reto barra", map)).toBeNull();
  });

  it("returns null when the imported exercise has no exact unique match", () => {
    const map = buildUniqueExerciseLibraryMatchMap([{ id: "id-1", name: "Hip Thrust Barra" }]);

    expect(resolveExerciseLibraryIdByName("Hip Thrust", map)).toBeNull();
    expect(resolveExerciseLibraryIdByName("", map)).toBeNull();
  });
});
