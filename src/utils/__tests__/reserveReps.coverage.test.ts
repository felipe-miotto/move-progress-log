/**
 * Source-based coverage do campo `Reserva` (reserve_reps) através do
 * fluxo manual e do fluxo de voz. Defensivo:
 *
 *   - Reserva NUNCA substitui `reps` (números coexistem).
 *   - Reserva é TEXTO LIVRE (0, 2-3, RM, 4+).
 *   - "Submáxima" sem número NÃO infere reserva (vai pra observations).
 *   - "RM" / "repetições máximas" / "falha técnica" → reserve_reps: "0".
 *   - Inicialização vinda da prescrição: `ex.rir` pré-preenche.
 *   - Total continua editável (PR anterior preserva).
 *
 * Estes testes lêem o código-fonte (source-based) e travam os
 * comportamentos por construção — não rodam DOM/jsdom.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel: string) {
  return readFileSync(resolve(__dirname, "../../..", rel), "utf-8");
}

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

const exerciseFirstSource = read("src/components/ExerciseFirstSessionEntry.tsx");
const recordGroupSource = read("src/components/RecordGroupSessionDialog.tsx");
const editSessionSource = read("src/components/EditSessionDialog.tsx");
const editGroupSource = read("src/components/EditGroupSessionDialog.tsx");
const previewCardSource = read("src/components/session/ExercisePreviewCard.tsx");
const exerciseEditorSource = read("src/components/session/ExerciseEditor.tsx");
const useExerciseLastSource = read("src/hooks/useExerciseLastSession.ts");
const useWorkoutSessionsSource = read("src/hooks/useWorkoutSessions.ts");
const typesRecordingSource = read("src/types/sessionRecording.ts");
const supabaseTypesSource = read("src/integrations/supabase/types.ts");
const audioRecorderSource = read("src/components/AudioSegmentRecorder.tsx");
const multiSegmentSource = read("src/components/MultiSegmentRecorder.tsx");
const voiceEdgeSource = read("supabase/functions/process-voice-session/index.ts");

// ── Types + DB column ──────────────────────────────────────────────────────

describe("reserve_reps — DB e tipos compartilhados", () => {
  it("public.exercises.reserve_reps existe nos Supabase types (Row + Insert + Update)", () => {
    // Confere as 3 facetas (Row, Insert, Update) na seção da tabela
    // `exercises` (não `exercises_library` que vem antes alfabeticamente).
    // Pega o bloco entre `\n      exercises: {` e o próximo `Relationships:`.
    const exercisesBlock = supabaseTypesSource.match(
      /\n\s{6}exercises:\s*\{[\s\S]*?Relationships:/,
    )?.[0] ?? "";
    expect(exercisesBlock.length).toBeGreaterThan(0);
    expect(exercisesBlock).toMatch(/reserve_reps:\s*string\s*\|\s*null/);
    expect(exercisesBlock).toMatch(/reserve_reps\?:\s*string\s*\|\s*null/);
    // E não tem ALTER que rename / drop — só o ADD.
    const migrations = read("supabase/migrations/20260519123000_add_reserve_reps_to_exercises.sql");
    expect(migrations).toMatch(/ADD COLUMN IF NOT EXISTS reserve_reps text NULL/);
    expect(migrations).toMatch(/COMMENT ON COLUMN public\.exercises\.reserve_reps IS/);
    expect(migrations).not.toMatch(/DROP COLUMN/);
    expect(migrations).not.toMatch(/RENAME COLUMN/);
  });

  it("SessionExercise (tipo compartilhado de gravação) tem reserve_reps opcional string|null", () => {
    expect(typesRecordingSource).toMatch(/reserve_reps\?:\s*string\s*\|\s*null/);
    // E NÃO converte pra número (Reserva não substitui Reps).
    expect(typesRecordingSource).not.toMatch(/reserve_reps\?:\s*number/);
  });
});

// ── ExerciseFirstSessionEntry — inicialização + UI + submit ───────────────

describe("ExerciseFirstSessionEntry — UI da Reserva (manual por exercício)", () => {
  const code = stripComments(exerciseFirstSource);

  it("declara reserve_reps em ExerciseData e PrescriptionExercise.rir", () => {
    expect(code).toMatch(/reserve_reps:\s*string/);
    // PrescriptionExercise precisa receber `rir` da prescrição.
    expect(code).toMatch(/\brir\??:\s*(string|null)/);
  });

  it("inicializa reserve_reps com ex.rir || '' (sem inferir)", () => {
    expect(code).toMatch(/reserve_reps:\s*ex\.rir\s*\|\|\s*""/);
  });

  it("renderiza label 'Reserva' (não 'RR', não 'RIR') no header e no campo", () => {
    expect(exerciseFirstSource).toMatch(/>\s*Reserva\s*</);
    expect(exerciseFirstSource).not.toMatch(/>\s*RR\s*</);
    expect(exerciseFirstSource).not.toMatch(/<TableHead[^>]*>RIR</);
    expect(exerciseFirstSource).not.toMatch(/<FormLabel[^>]*>RIR</);
  });

  it("renderiza campo editável Reserva tanto no mobile quanto no desktop", () => {
    // Pelo menos 2 inputs/textfields ligados a reserve_reps (mobile + desktop).
    const reserveInputs = code.match(/value=\{entry\.reserve_reps[^}]*\}/g) ?? [];
    expect(reserveInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("mostra reserve_reps da última carga quando existe (Res. X)", () => {
    expect(code).toMatch(/last\.reserve_reps\s*&&\s*` ·\s*Res\.\s*\$\{last\.reserve_reps\}/);
  });

  it('botão "Usar/Repetir última carga" copia também reserve_reps', () => {
    expect(code).toMatch(
      /reserve_reps:\s*last\.reserve_reps\s*\|\|\s*prev\[studentId\]\[exerciseIndex\]\.reserve_reps/,
    );
  });

  it("payload de submit envia reserve_reps junto com outros campos", () => {
    expect(code).toMatch(/reserve_reps:\s*entry\?\.reserve_reps\s*\|\|\s*""/);
  });
});

// ── RecordGroupSessionDialog — payload + reabertura + prescritos não mencionados

describe("RecordGroupSessionDialog — persistência da Reserva (manual + voz)", () => {
  const code = stripComments(recordGroupSource);

  it("ManualSavePayload e tipo de exercício carregam reserve_reps", () => {
    expect(code).toMatch(/reserve_reps\?:\s*string\s*\|\s*null/);
    expect(code).toMatch(/reserve_reps:\s*string\s*\|\s*null/);
  });

  it("select e mapping na reabertura incluem reserve_reps", () => {
    expect(code).toMatch(/\.select\([^)]*reserve_reps/);
    expect(code).toMatch(/reserve_reps:\s*ex\.reserve_reps\s*\|\|\s*null/);
  });

  it("payload de criação manual direta inclui reserve_reps", () => {
    expect(code).toMatch(/reserve_reps:\s*ex\.reserve_reps\s*\|\|\s*null/);
  });

  it("exercícios prescritos NÃO mencionados pré-preenchem reserve_reps com prescribed.rir || null", () => {
    expect(code).toMatch(/reserve_reps:\s*prescribed\.rir\s*\|\|\s*null/);
  });
});

// ── Edit dialogs (preservar campo na edição) ──────────────────────────────

describe("EditSessionDialog / EditGroupSessionDialog — preservam Reserva", () => {
  it("EditSessionDialog: interface Exercise declara reserve_reps, select e update incluem", () => {
    expect(editSessionSource).toMatch(/reserve_reps:\s*string\s*\|\s*null/);
    expect(editSessionSource).toMatch(/\.select\('[^']*reserve_reps/);
    expect(editSessionSource).toMatch(/reserve_reps:\s*exercise\.reserve_reps\s*\?\?\s*null/);
  });

  it("EditGroupSessionDialog: interface, select e update preservam reserve_reps", () => {
    expect(editGroupSource).toMatch(/reserve_reps:\s*string\s*\|\s*null/);
    expect(editGroupSource).toMatch(/reserve_reps,/);
    expect(editGroupSource).toMatch(/reserve_reps:\s*exercise\.reserve_reps\s*\?\?\s*null/);
  });
});

// ── PreviewCard mostra Reserva sem substituir Reps ─────────────────────────

describe("ExercisePreviewCard — exibe Reserva ao lado de Reps (não substitui)", () => {
  it("renderiza coluna 'Reserva' separada de 'Reps'", () => {
    expect(previewCardSource).toMatch(/>\s*Reserva:\s*</);
    expect(previewCardSource).toMatch(/>\s*Reps:\s*</);
  });

  it("usa grid de 4 colunas (Séries/Reps/Reserva/Carga), preservando layout original", () => {
    expect(previewCardSource).toMatch(/grid-cols-4/);
  });

  it("exibe '-' quando reserve_reps é null/vazio (nunca '0' inventado)", () => {
    expect(previewCardSource).toMatch(/ex\.reserve_reps[\s\S]*?'-'/);
  });
});

// ── ExerciseEditor (criação nova) ─────────────────────────────────────────

describe("ExerciseEditor — novo exercício inicia com reserve_reps: null (não inferir)", () => {
  it("addExercise default inclui reserve_reps: null", () => {
    expect(exerciseEditorSource).toMatch(/reserve_reps:\s*null/);
  });
});

// ── Hooks (history + queries) ─────────────────────────────────────────────

describe("hooks — reserve_reps em select, map e payload de gravação", () => {
  it("useExerciseLastSession seleciona reserve_reps e expõe no resultado", () => {
    expect(useExerciseLastSource).toMatch(/reserve_reps:\s*string\s*\|\s*null/);
    expect(useExerciseLastSource).toMatch(/\.select\("[^"]*reserve_reps/);
    expect(useExerciseLastSource).toMatch(
      /reserve_reps:\s*exercise\.reserve_reps\s*\?\?\s*null/,
    );
  });

  it("useWorkoutSessions: select, types e payload de criação/update incluem reserve_reps", () => {
    expect(useWorkoutSessionsSource).toMatch(/reserve_reps\?:\s*string/);
    expect(useWorkoutSessionsSource).toMatch(/\.select\("[^"]*reserve_reps/);
    // Map para payload de exercício preserva reserve_reps com fallback null.
    expect(useWorkoutSessionsSource).toMatch(
      /reserve_reps:\s*(exercise|row|ex)\.reserve_reps\s*\?\?\s*(undefined|null)/,
    );
  });
});

// ── Voz: contrato de entrada/edge prompt ──────────────────────────────────

describe("voz — AudioSegmentRecorder / MultiSegmentRecorder aceitam reserve_reps", () => {
  it("AudioSegmentRecorder declara reserve_reps no shape de exercícios", () => {
    expect(audioRecorderSource).toMatch(/reserve_reps\?:\s*string\s*\|\s*null/);
  });

  it("MultiSegmentRecorder declara reserve_reps no shape de exercícios", () => {
    expect(multiSegmentSource).toMatch(/reserve_reps\?:\s*string\s*\|\s*null/);
  });
});

describe("process-voice-session — prompt mapeia Reserva (texto livre, sem inferir)", () => {
  it("schema de saída inclui reserve_reps no exemplo de exercise", () => {
    expect(voiceEdgeSource).toMatch(/"reserve_reps":\s*"texto livre da reserva/);
  });

  it("prompt documenta exemplos válidos (0, 2-3, RM, 4+)", () => {
    expect(voiceEdgeSource).toMatch(/"2-3"/);
    expect(voiceEdgeSource).toMatch(/"RM"/);
    expect(voiceEdgeSource).toMatch(/"4\+"/);
  });

  it("prompt mapeia RM / repetições máximas / falha técnica → reserve_reps: \"0\"", () => {
    expect(voiceEdgeSource).toMatch(/RM/);
    expect(voiceEdgeSource).toMatch(/repetições\s+máximas/);
    expect(voiceEdgeSource).toMatch(/falha\s+técnica/);
    // O bloco MAPEAMENTOS OBRIGATÓRIOS aponta pra reserve_reps: "0".
    expect(voiceEdgeSource).toMatch(/→\s*reserve_reps:\s*"0"/);
  });

  it('prompt instrui "submáxima" sozinho → reserve_reps: null + observations: "Submáxima" (NÃO infere)', () => {
    expect(voiceEdgeSource).toMatch(/submáxima.*reserve_reps:\s*null/i);
    expect(voiceEdgeSource).toMatch(/observations:\s*"Submáxima"/);
    // Texto explicitamente proíbe inferência.
    expect(voiceEdgeSource).toMatch(/NÃO INFERIR/);
  });

  it("prompt afirma que Reserva NÃO substitui Reps (campos coexistem)", () => {
    expect(voiceEdgeSource).toMatch(/Reserva\s+NUNCA\s+substitui\s+o\s+campo\s+reps/i);
  });

  it("prompt instrui null quando não houver menção (não inventar)", () => {
    expect(voiceEdgeSource).toMatch(/reserve_reps:\s*null\s*\(NÃO inventar\)/);
  });
});
