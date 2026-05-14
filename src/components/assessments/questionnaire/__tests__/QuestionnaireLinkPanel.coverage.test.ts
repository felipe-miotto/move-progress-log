/**
 * Sanity test do fluxo E3.7 (wizard com geração de link).
 *
 * Sem DOM/testing-library, foco em invariantes que dão pra checar
 * via leitura do código-fonte como texto:
 *   - CreateAssessmentWizard NÃO desabilita questionnaire_precision12
 *   - CreateAssessmentWizard renderiza QuestionnaireLinkPanel pra
 *     esse tipo (não fallback null)
 *   - Cada AssessmentType do ASSESSMENT_TYPES tem case no switch
 *     (regressão: nenhum tipo fica sem renderização)
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { ASSESSMENT_TYPES } from "@/types/assessment";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const wizardPath = resolve(
  __dirname,
  "../../CreateAssessmentWizard.tsx",
);
const wizardSource = readFileSync(wizardPath, "utf-8");

describe("E3.7 CreateAssessmentWizard — sanity", () => {
  it("questionnaire_precision12 NÃO está desabilitado no step 1", () => {
    // Regressão do E2.C: o card era `disabled={isQuestionnaire}`.
    // Após E3.7 isso some.
    expect(wizardSource).not.toContain("disabled={isQuestionnaire}");
    expect(wizardSource).not.toMatch(/disabled.*questionnaire/i);
  });

  it("badge 'link mágico (E3)' não existe mais", () => {
    expect(wizardSource).not.toContain("link mágico (E3)");
  });

  it("renderiza QuestionnaireLinkPanel para questionnaire_precision12", () => {
    expect(wizardSource).toContain("QuestionnaireLinkPanel");
    // Confirma import
    expect(wizardSource).toContain('from "./questionnaire/QuestionnaireLinkPanel"');
  });

  it("switch cobre todos os 9 AssessmentTypes (regressão)", () => {
    for (const type of ASSESSMENT_TYPES) {
      // Cada case deve aparecer literalmente no source
      expect(wizardSource).toContain(`case "${type}":`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Sanity do QuestionnaireLinkPanel
// ────────────────────────────────────────────────────────────────────────────

const panelPath = resolve(
  __dirname,
  "../QuestionnaireLinkPanel.tsx",
);
const panelSource = readFileSync(panelPath, "utf-8");

describe("E3.7 QuestionnaireLinkPanel — sanity", () => {
  it("invoca create-precision12-questionnaire-link", () => {
    expect(panelSource).toContain('"create-precision12-questionnaire-link"');
  });

  it("não envia assessment_id no body (delega criação à edge)", () => {
    // body deve conter student_id + frontend_origin; assessment_id é
    // resolvido pela edge function (cria ou reusa).
    expect(panelSource).toContain("student_id: studentId");
    expect(panelSource).not.toMatch(/body:\s*\{[^}]*assessment_id/s);
  });

  it("invalida cache da lista de assessments após gerar", () => {
    expect(panelSource).toContain(
      '["assessments", "by-student", studentId]',
    );
  });

  it("não loga token nem invite_url no console", () => {
    // O code path NÃO tem console.log(token) nem console.log(invite_url).
    // Permite console.error pra erros (sem dados sensíveis).
    expect(panelSource).not.toMatch(/console\.log\([^)]*invite_url/);
    expect(panelSource).not.toMatch(/console\.log\([^)]*token/);
  });

  it("não salva em storage (apenas menção em comentário do header)", () => {
    // Remove comentários linha-única e bloco antes de checar.
    const codeOnly = panelSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/localStorage|sessionStorage/);
  });

  it("reissue pede confirmação via window.confirm", () => {
    expect(panelSource).toContain("window.confirm");
    expect(panelSource).toContain(
      "Gerar um novo link revoga o anterior",
    );
  });

  it("usa navigator.clipboard.writeText pra copiar", () => {
    expect(panelSource).toContain("navigator.clipboard.writeText");
  });
});
