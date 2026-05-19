/**
 * Source-based defensivo da calculadora de carga dentro de
 * `supabase/functions/process-voice-session/index.ts`.
 *
 * Por que existir:
 * - A edge tem SEU PRÓPRIO calculador (Deno, sem import do `src/`).
 *   Divergência entre o calculador do cliente (`loadCalculation.ts`)
 *   e o da voz é fonte recorrente de bug — o coach grava um áudio e
 *   a carga salva fica errada porque a edge sobrescreve `load_kg` via
 *   `validateAndRecalculateLoad`.
 * - Bug real observado em prod (2026-05-18): usuário disse
 *   "70 lb cada lado + barra 15kg" e a edge salvou 46.8 em vez de 78.5
 *   porque o regex era `/de cada lado/i` estrito + faltava caminho
 *   sem-parênteses pra "cada lado".
 *
 * Estes testes TRAVAM por construção:
 *   1. Regex de "cada lado" tolera ausência de "de" (alinha com cliente).
 *   2. Usa `POUND_TO_KG_CONVERSION` sem arredondamento intermediário.
 *   3. `roundToDecimal` só roda na saída final.
 *   4. Prompt da extração não contradiz a regra (exemplos com "de cada lado").
 *
 * Padrão coverage-test (sem Deno runtime), igual aos testes source-based
 * da edge `extract-dexa-pdf`.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const edgePath = resolve(
  __dirname,
  "../../../supabase/functions/process-voice-session/index.ts",
);
const edgeSource = readFileSync(edgePath, "utf-8");

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

describe("process-voice-session — regras de carga alinhadas com o cliente", () => {
  const code = stripComments(edgeSource);

  it("aceita 'cada lado' SEM 'de' em normalizeBreakdown (regex tolerante)", () => {
    // Padrão obrigatório: `(?:de\s*)?cada\s*lado` (não `/de cada lado/i`).
    expect(code).toMatch(/function\s+normalizeBreakdown/);
    // Bloqueia regex velho estrito (que ignorava "cada lado" sem "de").
    expect(code).not.toMatch(/\/de cada lado\/i\.test\(breakdown\)/);
    expect(code).not.toMatch(/\.match\(\s*\/\\\(\(\.\*\?\)\\\)\\s\*de cada lado/);
    // Exige tolerância em test() e match().
    expect(code).toMatch(/\(\?:de\\s\*\)\?cada\\s\*lado/);
  });

  it("calculateLoadFromBreakdown também tolera 'cada lado' sem 'de'", () => {
    expect(code).toMatch(/function\s+calculateLoadFromBreakdown/);
    // Após o fix, o eachSidePattern é criado e usado dentro da função.
    expect(code).toMatch(/eachSidePattern\s*=\s*\/\(\?:de\\s\*\)\?cada\\s\*lado/);
    // E `eachSidePattern.test(breakdown)` deve aparecer no fluxo.
    expect(code).toMatch(/eachSidePattern\.test\(breakdown\)/);
  });

  it("calculator tem ramo PARENS + ramo SEM-PARENS para 'cada lado' (espelha o cliente)", () => {
    // Ramo com parens: parenMatch
    expect(code).toMatch(/parenMatch\s*=\s*breakdown\.match\([\s\S]*?\\\(\(\.\*\?\)\\\)\\s\*\(\?:de\\s\*\)\?cada\\s\*lado/);
    // Ramo SEM parens: split em eachSidePattern + remoção da barra
    expect(code).toMatch(/beforeEachSide\s*=\s*breakdown\.split\(\s*eachSidePattern\s*\)/);
  });

  it("converte lb usando POUND_TO_KG_CONVERSION SEM arredondamento intermediário", () => {
    expect(code).toMatch(/const POUND_TO_KG_CONVERSION\s*=\s*0\.4536/);
    expect(code).toMatch(/unit\.startsWith\('lb'\)\s*\?\s*value\s*\*\s*POUND_TO_KG_CONVERSION\s*:\s*value/);
    // Bloqueia padrões de arredondamento intermediário em lb.
    expect(code).not.toMatch(
      /roundToDecimal\(\s*[\w.]+\s*\*\s*POUND_TO_KG_CONVERSION\s*\)\s*\*\s*2/,
    );
    expect(code).not.toMatch(
      /Math\.round\(\s*[\w.]+\s*\*\s*POUND_TO_KG_CONVERSION/,
    );
  });

  it('suporta multiplicador explícito "2x70lb" na calculadora da edge', () => {
    expect(edgeSource).toContain('const WEIGHT_TERM_PATTERN');
    expect(edgeSource).toContain('[x×]');
    expect(edgeSource).toContain('lbs?');
    expect(code).toMatch(/function\s+addWeightTerms|const\s+addWeightTerms/);
    expect(code).toMatch(/quantity\s*=\s*match\[1\]\s*\?\s*parseNumeric\(match\[1\]\)\s*:\s*1/);
    expect(code).toMatch(/subtotal\s*\+=\s*quantity\s*\*\s*kg\s*\*\s*multiplier/);
  });

  it("roundToDecimal só é chamado uma vez (no return final do calculator)", () => {
    const fnBlock = code.match(
      /function\s+calculateLoadFromBreakdown\([\s\S]*?\n\s{4}\}\s*\n/,
    )?.[0] ?? "";
    expect(fnBlock.length).toBeGreaterThan(0);
    const rounds = fnBlock.match(/roundToDecimal\(/g) ?? [];
    // Esperado: 1 chamada no `return total > 0 ? roundToDecimal(total) : null;`
    // (mais opcionalmente 1 no path de "Peso corporal = X kg" que já é exato).
    expect(rounds.length).toBeLessThanOrEqual(2);
    // E o RETURN final usa roundToDecimal.
    expect(fnBlock).toMatch(
      /return\s+total\s*>\s*0\s*\?\s*roundToDecimal\(\s*total\s*\)\s*:\s*null/,
    );
  });

  it("validateAndRecalculateLoad usa a calculadora como fonte de verdade (override do LLM em diff > 0.1)", () => {
    expect(code).toMatch(/function\s+validateAndRecalculateLoad/);
    // Compara com o calculado e sobrescreve.
    expect(code).toMatch(/calculatedLoadKg\s*=\s*calculateLoadFromBreakdown/);
    expect(code).toMatch(/diff\s*>\s*0\.1/);
    expect(code).toMatch(/exercise\.load_kg\s*=\s*calculatedLoadKg/);
  });

  it("prompt da IA usa 'de cada lado' como forma canônica (não contradiz o calculator)", () => {
    // Documentação interna do prompt deve manter o exemplo canônico.
    // O calculator tolera ambas as formas, mas o prompt orienta o LLM
    // a sempre emitir "de cada lado" pra consistência downstream.
    expect(edgeSource).toMatch(/"\(25 lb \+ 2 kg \+ 1 kg\) de cada lado/);
  });

  it("regra de barra: peso da barra entra direto, NÃO multiplica por 2", () => {
    // Documentação da regra no prompt + caminho explícito no calculator.
    expect(edgeSource).toContain('BARRA_BILATERAL');
    // No calculator, `barraMatch` é tratado fora do bloco "cada lado".
    expect(code).toMatch(
      /barraMatch\s*=\s*breakdown\.match\(\s*\/barra\\s\*\(\\d/,
    );
    // E somado direto (sem `* 2`).
    expect(code).toMatch(
      /total\s*\+=\s*parseFloat\(\s*barraMatch\[1\]\.replace\(',', '\.'\)\s*\)\s*;/,
    );
  });

  it("kettlebells/halteres duplos multiplicam por 2 (regra de halter duplo)", () => {
    expect(code).toMatch(
      /multiKbMatch\s*=\s*breakdown\.match\([\s\S]*?2\\s\*kettlebells\?\|duplo\\s\*kettlebell\|kettlebell\\s\*duplo\|dois\\s\*halteres\|2\\s\*halteres/,
    );
    // Multiplica por 2.
    expect(code).toMatch(/total\s*\+=\s*kg\s*\*\s*2/);
  });

  it("sanitiza load_kg/load_breakdown vazios → null (regra 'nunca inventar')", () => {
    expect(code).toMatch(/function\s+sanitizeExerciseData/);
    expect(code).toMatch(/'load_kg'\s*,\s*'load_breakdown'\s*,\s*'reps'\s*,\s*'sets'\s*,\s*'observations'/);
    // Valores 0/""/'não informado' viram null.
    expect(code).toMatch(/===\s*0\s*\|\|\s*[\w.[\]]+\s*===\s*''\s*\|\|\s*[\w.[\]]+\s*===\s*'não informado'/);
  });
});
