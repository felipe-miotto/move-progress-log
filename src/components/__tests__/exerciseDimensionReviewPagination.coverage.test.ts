import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*\n/g, '');

const code = stripComments(
  readFileSync(resolve(__dirname, '../ExerciseDimensionReview.tsx'), 'utf-8'),
);

// Regression guard: the review table used to render `(exercises || []).slice(0, 100)`,
// so a reviewer could never reach items past the first 100 of a filter and could
// believe everything was reviewed. It must paginate over the full in-memory list.
describe('ExerciseDimensionReview — paginates the full review list', () => {
  it('no longer hard-caps the render at the first 100 items', () => {
    expect(code).not.toMatch(/\.slice\(0,\s*100\)\.map/);
    expect(code).not.toContain('Exibindo 100 de');
  });

  it('renders the current page slice instead', () => {
    expect(code).toContain('const PAGE_SIZE = 100');
    expect(code).toContain('pageExercises.map');
    expect(code).toContain('allExercises.slice(pageStart, pageStart + PAGE_SIZE)');
  });

  it('resets to page 1 when the filters change', () => {
    expect(code).toContain('setCurrentPage(1)');
    expect(code).toMatch(/\[filter, categoryFilter\]/);
  });

  it('clamps the page into range when the list shrinks', () => {
    expect(code).toContain('Math.min(Math.max(1, p), totalPages)');
  });

  it('drives the pager from the clamped safePage and shows the real range', () => {
    expect(code).toContain('setCurrentPage(safePage - 1)');
    expect(code).toContain('setCurrentPage(safePage + 1)');
    expect(code).toContain('pageStart + pageExercises.length');
  });
});
