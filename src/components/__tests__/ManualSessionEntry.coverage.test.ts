import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = resolve(__dirname, '../ManualSessionEntry.tsx');
const source = readFileSync(sourcePath, 'utf-8');

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*\n/g, '');

const code = stripComments(source);

describe('ManualSessionEntry — carga total editável', () => {
  it('mantém campo Carga (kg) como input numérico editável pelo coach', () => {
    expect(code).toContain('<Label className="text-xs">Carga (kg)</Label>');
    expect(code).toMatch(/<Input[\s\S]*?type="number"[\s\S]*?step="0\.1"[\s\S]*?value=\{exercise\.load_kg \|\| ''\}/);
    expect(code).toMatch(/onChange=\{\(e\) => \{[\s\S]*?updateExercise\(currentStudent\.id, idx, 'load_kg', value\);[\s\S]*?\}\}/);
  });

  it('não bloqueia edição da carga calculada, exceto para peso corporal', () => {
    expect(code).toMatch(/disabled=\{exercise\.load_breakdown\.toLowerCase\(\)\.includes\('peso corporal'\)\}/);
    expect(code).not.toMatch(/disabled=\{(?:calculatedLoad|requiresReview|exercise\.load_kg|autoCalculate)/);
  });

  it('continua recalculando no blur da composição, mas permite override manual depois', () => {
    expect(code).toMatch(/onBlur=\{\(\) => handleLoadBlur\(currentStudent\.id, idx\)\}/);
    expect(code).toMatch(/load_kg:\s*calculatedLoad/);
    expect(code).toMatch(/updateExercise\(currentStudent\.id, idx, 'load_kg', value\)/);
  });
});
