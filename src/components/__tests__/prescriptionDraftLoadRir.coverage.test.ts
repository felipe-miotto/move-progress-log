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

const read = (rel: string) => stripComments(readFileSync(resolve(__dirname, rel), 'utf-8'));

const createCode = read('../CreatePrescriptionDialog.tsx');
const editCode = read('../EditPrescriptionDialog.tsx');
const hookCode = read('../../hooks/usePrescriptionDraft.ts');

// Regression guard for the prescription-draft data loss: restoring a draft from
// history used to hardcode `load: "", rir: ""` and never restored
// prescriptionType, so individual load/RIR values were silently dropped.
describe('prescription draft preserves load/rir/prescriptionType on restore', () => {
  for (const [name, code] of [['Create', createCode], ['Edit', editCode]] as const) {
    describe(`${name}PrescriptionDialog`, () => {
      it('does not zero out load/rir when restoring a draft', () => {
        expect(code).not.toMatch(/\.\.\.ex,\s*load:\s*"",\s*rir:\s*""/);
      });

      it('restores load/rir from the stored exercise', () => {
        expect(code).toContain('load: ex.load ?? ""');
        expect(code).toContain('rir: ex.rir ?? ""');
      });

      it('persists prescriptionType in the autosave payload', () => {
        expect(code).toContain('saveDraft({ name, objective, exercises, prescriptionType })');
      });

      it('restores prescriptionType when handling a draft restore', () => {
        expect(code).toContain('setPrescriptionType(draftData.prescriptionType)');
      });
    });
  }

  describe('usePrescriptionDraft', () => {
    it('exports a shared draft exercise type with optional load/rir', () => {
      expect(hookCode).toMatch(/export interface PrescriptionDraftExercise/);
      expect(hookCode).toMatch(/load\?: string/);
      expect(hookCode).toMatch(/rir\?: string/);
    });

    it('persists prescriptionType in the saved draft', () => {
      expect(hookCode).toContain('prescriptionType: data.prescriptionType');
    });

    it('treats load/rir changes as unsaved changes', () => {
      expect(hookCode).toMatch(/ex\.load !== d\.load/);
      expect(hookCode).toMatch(/ex\.rir !== d\.rir/);
    });
  });
});
