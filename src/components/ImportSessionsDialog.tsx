import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { useGetOrCreateStudent } from "@/hooks/useStudents";
import { useCreateWorkoutSession } from "@/hooks/useWorkoutSessions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildErrorDescription,
  parseErrorInfo,
  type ParsedErrorInfo,
} from "@/utils/errorParsing";
import { calculateLoadFromBreakdown } from "@/utils/loadCalculation";
import { logger } from "@/utils/logger";
import { formatSessionTime } from "@/utils/sessionTime";
import { invalidateSessionQueries } from "@/hooks/sessionQueryInvalidation";

type SpreadsheetRow = Record<string, unknown>;

const normalizeHeader = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
};

const resolveCanonicalHeader = (header: string): string => {
  const normalized = normalizeHeader(header);

  if (["aluno", "nome", "nome aluno", "nome do aluno", "student", "atleta", "athlete"].includes(normalized)) {
    return "student";
  }
  if (["data", "date", "dia", "data treino", "data do treino"].includes(normalized)) {
    return "date";
  }
  if (["hora", "horario", "horario treino", "hora treino", "time"].includes(normalized)) {
    return "time";
  }
  if (
    [
      "exercicio",
      "exercise",
      "nome exercicio",
      "nome do exercicio",
      "exercicio nome",
      "movimento",
    ].includes(normalized)
  ) {
    return "exercise";
  }
  if (["series", "serie", "sets", "set"].includes(normalized)) {
    return "sets";
  }
  if (
    [
      "reps",
      "repeticoes",
      "repeticao",
      "rep",
      "n reps",
      "n rep",
      "no reps",
      "numero reps",
      "numero de reps",
    ].includes(normalized)
  ) {
    return "reps";
  }
  if (
    [
      "carga",
      "carga kg",
      "carga total",
      "carga total kg",
      "carga parcial",
      "carga parcial kg",
      "peso",
      "load",
      "kg",
    ].includes(normalized)
  ) {
    return "load";
  }
  if (["observacoes", "observacao", "obs", "notes", "note"].includes(normalized)) {
    return "notes";
  }

  return normalized;
};

const extractCellValue = (value: unknown): unknown => {
  if (value instanceof Date) return value;
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;

  if ("result" in record && record.result !== undefined && record.result !== null) {
    return record.result;
  }

  if ("text" in record && typeof record.text === "string") {
    return record.text;
  }

  if ("richText" in record && Array.isArray(record.richText)) {
    const text = (record.richText as Array<{ text?: string }>)
      .map((item) => item.text || "")
      .join("")
      .trim();
    if (text) return text;
  }

  return value;
};

const formatDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStringValue = (row: SpreadsheetRow, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key] ?? row[normalizeHeader(key)];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
};

const getNumberValue = (row: SpreadsheetRow, keys: string[]): number | undefined => {
  const parseNumericFromText = (raw: string): number | undefined => {
    const value = raw.trim();
    if (!value) return undefined;

    const direct = Number(value.replace(",", "."));
    if (!Number.isNaN(direct) && Number.isFinite(direct)) return direct;

    if (value.includes("=")) {
      const afterEquals = value.split("=").pop()?.trim() || "";
      const tailMatch = afterEquals.match(/-?\d+(?:[.,]\d+)?/);
      if (tailMatch) {
        const parsed = Number(tailMatch[0].replace(",", "."));
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
      }
    }

    const multiplicative = value.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
    if (multiplicative && !/[+]/.test(value)) {
      const left = Number(multiplicative[1].replace(",", "."));
      const right = Number(multiplicative[2].replace(",", "."));
      if (!Number.isNaN(left) && !Number.isNaN(right)) return left * right;
    }

    const allMatches = value.match(/-?\d+(?:[.,]\d+)?/g);
    if (!allMatches || allMatches.length === 0) return undefined;

    const last = allMatches[allMatches.length - 1];
    const parsed = Number(last.replace(",", "."));
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
    return undefined;
  };

  for (const key of keys) {
    const value = row[key] ?? row[normalizeHeader(key)];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseNumericFromText(value);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
};

const parseAmPmTime = (input: string): string | null => {
  const match = input.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 12 || minutes > 59) return null;
  const period = match[3].toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseCompactTime = (value: number): string | null => {
  if (!Number.isInteger(value) || value < 0 || value > 2359) return null;
  const hours = Math.floor(value / 100);
  const minutes = value % 100;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

interface ImportSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SessionRow {
  aluno: string;
  data: string;
  hora: string;
  exercicio: string;
  series?: number;
  reps?: number;
  carga?: number;
  cargaDescricao?: string;
  observacoes?: string;
}

interface ProcessingStatus {
  total: number;
  attempted: number;
  processed: number;
  mergedDuplicates: number;
  skippedDuplicates: number;
  errors: string[];
  success: boolean;
}

interface ImportErrorGroup {
  key: string;
  title: string;
  action: string;
  errors: string[];
}

const categorizeImportErrors = (errors: string[]): ImportErrorGroup[] => {
  const groups: Record<string, ImportErrorGroup> = {
    databaseFunction: {
      key: "databaseFunction",
      title: "Função do banco indisponível",
      action: "Republique a função RPC/migration antes de tentar importar novamente.",
      errors: [],
    },
    spreadsheetFormat: {
      key: "spreadsheetFormat",
      title: "Formato da planilha",
      action: "Revise colunas obrigatórias, datas, horários e linhas vazias.",
      errors: [],
    },
    studentOrSession: {
      key: "studentOrSession",
      title: "Aluno ou sessão",
      action: "Confirme nome do aluno, data, horário e se a sessão já existe.",
      errors: [],
    },
    other: {
      key: "other",
      title: "Outros erros",
      action: "Abra os detalhes técnicos e use o primeiro exemplo para diagnóstico.",
      errors: [],
    },
  };

  errors.forEach((error) => {
    const normalized = error.toLowerCase();

    if (
      normalized.includes("could not find the function") ||
      normalized.includes("schema cache") ||
      normalized.includes("public.create_workout_session")
    ) {
      groups.databaseFunction.errors.push(error);
      return;
    }

    if (
      normalized.includes("coluna") ||
      normalized.includes("column") ||
      normalized.includes("linha") ||
      normalized.includes("row") ||
      normalized.includes("data") ||
      normalized.includes("hora") ||
      normalized.includes("formato") ||
      normalized.includes("required") ||
      normalized.includes("obrigat")
    ) {
      groups.spreadsheetFormat.errors.push(error);
      return;
    }

    if (
      normalized.includes("aluno") ||
      normalized.includes("student") ||
      normalized.includes("sess") ||
      normalized.includes("duplicate") ||
      normalized.includes("duplicad")
    ) {
      groups.studentOrSession.errors.push(error);
      return;
    }

    groups.other.errors.push(error);
  });

  return Object.values(groups).filter((group) => group.errors.length > 0);
};

const formatExcelSerialDate = (serial: number): string | null => {
  if (!Number.isFinite(serial)) return null;
  const wholeDays = Math.floor(serial);
  if (wholeDays <= 0) return null;
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const dateUtc = new Date(excelEpochUtc + wholeDays * 86400 * 1000);
  const year = dateUtc.getUTCFullYear();
  const month = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateUtc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isDuplicateSessionError = (errorInfo: ParsedErrorInfo): boolean => {
  const raw = `${errorInfo.message} ${errorInfo.details ?? ""} ${errorInfo.hint ?? ""}`.toLowerCase();
  return (
    errorInfo.code === "23505" ||
    raw.includes("duplicate key") ||
    raw.includes("already exists") ||
    raw.includes("idx_unique_student_session") ||
    raw.includes("workout_sessions_student_id_date_time")
  );
};

const normalizeExerciseName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");

const parseTimeToMinutes = (timeValue: string): number | null => {
  const [h, m] = timeValue.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const mergeDuplicateSessionData = async (params: {
  studentId: string;
  date: string;
  time: string;
  exercises: SessionRow[];
}): Promise<number> => {
  const { data: candidateSessions, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, time, created_at")
    .eq("student_id", params.studentId)
    .eq("date", params.date)
    .order("created_at", { ascending: false })
    .limit(50);

  if (sessionError || !candidateSessions || candidateSessions.length === 0) return 0;

  const targetMinutes = parseTimeToMinutes(params.time);
  const normalizeCandidateTime = (value: unknown): string => formatSessionTime(String(value));
  const sameMinute = candidateSessions.find(
    (session) => normalizeCandidateTime(session.time) === params.time
  );

  let selectedSession = sameMinute ?? null;
  if (!selectedSession && targetMinutes !== null) {
    const nearest = candidateSessions
      .map((session) => {
        const sessionMinutes = parseTimeToMinutes(normalizeCandidateTime(session.time));
        return {
          session,
          distance:
            sessionMinutes === null
              ? Number.POSITIVE_INFINITY
              : Math.abs(sessionMinutes - targetMinutes),
        };
      })
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearest && Number.isFinite(nearest.distance) && nearest.distance <= 1) {
      selectedSession = nearest.session;
    }
  }

  if (!selectedSession) return 0;

  const { data: existingExercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, exercise_name, sets, reps, load_kg, load_description, observations, created_at")
    .eq("session_id", selectedSession.id)
    .order("created_at", { ascending: true });

  if (exercisesError || !existingExercises) return 0;

  const usedExerciseIds = new Set<string>();
  const fallbackPairs: Array<{ imported: SessionRow; existing: (typeof existingExercises)[number] }> = [];
  let mergedCount = 0;

  const importedByName = params.exercises.map((exercise, index) => ({
    index,
    exercise,
    normalized: normalizeExerciseName(exercise.exercicio),
  }));

  for (const imported of importedByName) {
    const exact = existingExercises.find(
      (exercise) =>
        !usedExerciseIds.has(exercise.id) &&
        normalizeExerciseName(exercise.exercise_name) === imported.normalized
    );
    if (!exact) continue;
    usedExerciseIds.add(exact.id);
    fallbackPairs.push({ imported: imported.exercise, existing: exact });
  }

  if (fallbackPairs.length < importedByName.length && existingExercises.length === params.exercises.length) {
    for (let i = 0; i < params.exercises.length; i += 1) {
      const existing = existingExercises[i];
      if (!existing || usedExerciseIds.has(existing.id)) continue;
      usedExerciseIds.add(existing.id);
      fallbackPairs.push({ imported: params.exercises[i], existing });
    }
  }

  for (const pair of fallbackPairs) {
    const { imported, existing } = pair;

    const patch: Record<string, unknown> = {};
    const normalizedLoadDescription = imported.cargaDescricao?.trim() || "";
    const normalizedObservation = imported.observacoes?.trim() || "";
    const parsedLoadFromDescription = normalizedLoadDescription
      ? calculateLoadFromBreakdown(normalizedLoadDescription)
      : null;
    const parsedLoadFromObservation = normalizedObservation
      ? calculateLoadFromBreakdown(normalizedObservation)
      : null;

    if (
      (existing.sets === null || existing.sets === undefined || existing.sets <= 0) &&
      imported.series !== undefined
    ) {
      patch.sets = imported.series;
    }
    if (
      (existing.reps === null || existing.reps === undefined || existing.reps <= 0) &&
      imported.reps !== undefined
    ) {
      patch.reps = imported.reps;
    }
    if ((existing.load_kg === null || existing.load_kg === undefined) && imported.carga !== undefined) {
      patch.load_kg = imported.carga;
    }
    if (
      (existing.load_kg === null || existing.load_kg === undefined) &&
      patch.load_kg === undefined &&
      parsedLoadFromDescription !== null
    ) {
      patch.load_kg = parsedLoadFromDescription;
    }
    if (
      (existing.load_kg === null || existing.load_kg === undefined) &&
      patch.load_kg === undefined &&
      parsedLoadFromObservation !== null
    ) {
      patch.load_kg = parsedLoadFromObservation;
    }
    if (
      (!existing.load_description || !existing.load_description.trim()) &&
      normalizedLoadDescription
    ) {
      patch.load_description = normalizedLoadDescription;
    }
    if (
      (!existing.load_description || !existing.load_description.trim()) &&
      patch.load_description === undefined &&
      parsedLoadFromObservation !== null &&
      normalizedObservation
    ) {
      patch.load_description = normalizedObservation;
    }
    if (
      (!existing.observations || !existing.observations.trim()) &&
      normalizedObservation
    ) {
      patch.observations = normalizedObservation;
    }

    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase
      .from("exercises")
      .update(patch)
      .eq("id", existing.id);

    if (!updateError) mergedCount += 1;
  }

  return mergedCount;
};

export const ImportSessionsDialog = ({ open, onOpenChange }: ImportSessionsDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const queryClient = useQueryClient();

  const getOrCreateStudent = useGetOrCreateStudent();
  const createSession = useCreateWorkoutSession();

  const invalidateAfterImport = async () => {
    await invalidateSessionQueries(queryClient, {
      includeStudentsData: true,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus(null);
      toast("Arquivo carregado", {
        description: `${selectedFile.name} pronto para importação.`,
        duration: 3000,
      });
    }
  };

  const parseExcelDate = (excelDate: unknown): string | null => {
    if (excelDate instanceof Date) {
      return formatDate(excelDate);
    }

    if (typeof excelDate === "string") {
      // Tenta parsear string no formato DD/MM/YYYY ou YYYY-MM-DD
      const parts = excelDate.includes("/") ? excelDate.split("/") : excelDate.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss
          return excelDate.slice(0, 10);
        } else {
          // DD/MM/YYYY
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    }
    
    if (typeof excelDate === "number") {
      // Excel armazena datas como números seriais (dias desde 1899-12-30).
      return formatExcelSerialDate(excelDate);
    }
    
    return null;
  };

  const parseTime = (timeValue: unknown): string | null => {
    if (timeValue instanceof Date) {
      // Excel time cells may come as Date objects anchored in 1899 with historical timezone offsets.
      // UTC extraction avoids local offset artifacts like 04:53:00 for intended 08:00.
      const hours = String(timeValue.getUTCHours()).padStart(2, "0");
      const minutes = String(timeValue.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    if (typeof timeValue === "string") {
      const normalized = timeValue.trim();
      if (!normalized) return null;
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(normalized)) {
        const [rawHour, rawMinute] = normalized.split(":");
        const hour = Number(rawHour);
        const minute = Number(rawMinute);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        }
        return null;
      }
      const amPmParsed = parseAmPmTime(normalized);
      if (amPmParsed) return amPmParsed;

      if (/^\d{3,4}$/.test(normalized)) {
        const compactParsed = parseCompactTime(Number(normalized));
        if (compactParsed) return compactParsed;
      }

      const numeric = Number(normalized.replace(",", "."));
      if (Number.isFinite(numeric)) {
        if (numeric > 1) return null;
        if (numeric < 0) return null;
        const totalMinutes = Math.round(numeric * 24 * 60) % (24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      return null;
    }
    if (typeof timeValue === "number") {
      const compactParsed = parseCompactTime(timeValue);
      if (compactParsed) return compactParsed;

      if (timeValue < 0 || timeValue > 1) return null;
      // Excel armazena tempo como fração do dia (0..1)
      const totalMinutes = Math.round(timeValue * 24 * 60) % (24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    return null;
  };

  const processFile = async () => {
    if (!file) return;

    setProcessing(true);
    setStatus({
      total: 0,
      attempted: 0,
      processed: 0,
      mergedDuplicates: 0,
      skippedDuplicates: 0,
      errors: [],
      success: false,
    });
    
    let toastId: string | number | undefined;

    try {
      // Toast inicial
      toastId = toast.loading("Lendo arquivo Excel...", {
        description: "Processando planilha"
      });

      const { default: ExcelJS } = await import("exceljs");
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      const worksheet = workbook.worksheets[0];
      const detectedHeaders: string[] = [];
      
      // Convert ExcelJS worksheet to array of objects
      const jsonData: SpreadsheetRow[] = [];
      const headers: string[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell, colNumber) => {
            const rawHeader = String(cell.value ?? "").trim();
            detectedHeaders.push(rawHeader);
            headers[colNumber] = resolveCanonicalHeader(rawHeader);
          });
        } else {
          const rowObj: SpreadsheetRow = {};
          row.eachCell((cell, colNumber) => {
            const key = headers[colNumber];
            if (key) rowObj[key] = extractCellValue(cell.value);
          });
          jsonData.push(rowObj);
        }
      });

      // Agrupa por aluno + data + hora
      const sessionsMap = new Map<string, SessionRow[]>();
      const validationErrors: string[] = [];
      let validRows = 0;

      jsonData.forEach((row, index) => {
        const alunoRaw = getStringValue(row, ["student", "aluno", "nome", "nome do aluno"]);
        const dataRaw = row["date"] ?? row["data"];
        const horaRaw = row["time"] ?? row["hora"];
        const parsedDate = parseExcelDate(dataRaw);
        const parsedTime = parseTime(horaRaw);
        const exerciseName = getStringValue(row, ["exercise", "exercicio", "nome exercicio"]);

        // Skip blank lines or incomplete rows from spreadsheet exports.
        if (!alunoRaw || !exerciseName) return;

        if (!parsedDate) {
          validationErrors.push(`Linha ${index + 2}: data inválida (${String(dataRaw ?? "vazio")})`);
          return;
        }
        if (!parsedTime) {
          validationErrors.push(`Linha ${index + 2}: hora inválida (${String(horaRaw ?? "vazio")})`);
          return;
        }

        validRows++;

        const sessionKey = `${alunoRaw.toLowerCase()}_${parsedDate}_${parsedTime}`;
        const sessionRow: SessionRow = {
          aluno: alunoRaw,
          data: parsedDate,
          hora: parsedTime,
          exercicio: exerciseName,
          series: getNumberValue(row, ["sets", "series", "séries"]),
          reps: getNumberValue(row, ["reps", "n reps", "repeticoes", "repetições"]),
          carga: getNumberValue(row, ["load", "carga", "carga kg", "carga total", "carga total kg", "carga parcial"]),
          cargaDescricao: getStringValue(row, ["load", "carga", "carga kg", "carga total", "carga total kg", "carga parcial"]) || undefined,
          observacoes: getStringValue(row, ["notes", "observacoes", "observações"]) || undefined,
        };

        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, []);
        }
        sessionsMap.get(sessionKey)!.push(sessionRow);
      });

      const totalSessions = sessionsMap.size;
      if (totalSessions === 0) {
        const validationPreview = validationErrors.slice(0, 5).join(" | ");
        throw new Error(
          `Nenhuma linha válida encontrada para importação. Verifique cabeçalhos (detected: ${detectedHeaders
            .filter(Boolean)
            .join(", ")}) e se as colunas de aluno + exercício estão preenchidas.${
            validationPreview ? ` Erros de validação: ${validationPreview}` : ""
          }`
        );
      }
      setStatus((prev) => ({ ...prev!, total: totalSessions }));
      
      // Atualiza toast com total encontrado
      toast.loading(`Processando ${totalSessions} sessão(ões)...`, {
        id: toastId,
        description: "Importando dados para o sistema"
      });

      let attempted = 0;
      let processed = 0;
      let mergedDuplicates = 0;
      let skippedDuplicates = 0;
      const errors: string[] = [...validationErrors];

      for (const [key, exercises] of sessionsMap) {
        const firstRow = exercises[0];
        attempted++;
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                attempted,
              }
            : prev
        );

        let currentStudentId = "";
        try {
          // Atualiza toast com progresso atual
          toast.loading(`Processando sessão ${attempted} de ${totalSessions}`, {
            id: toastId,
            description: `Aluno: ${firstRow.aluno} - ${exercises.length} exercício(s)`
          });
          
          // Cria ou busca aluno
          const currentStudent = await getOrCreateStudent.mutateAsync(firstRow.aluno);
          currentStudentId = currentStudent.id;

          // Cria sessão com exercícios
          await createSession.mutateAsync({
            student_id: currentStudent.id,
            date: firstRow.data,
            time: firstRow.hora,
            exercises: exercises.map((ex) => ({
              exercise_name: ex.exercicio,
              sets: ex.series,
              reps: ex.reps,
              load_kg: ex.carga,
              load_description: ex.cargaDescricao,
              observations: ex.observacoes,
            })),
            silent: true,
          });

          processed++;
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  attempted,
                  processed,
                  mergedDuplicates,
                  skippedDuplicates,
                }
              : prev
          );
        } catch (error: unknown) {
          const errorInfo = parseErrorInfo(error);

          if (isDuplicateSessionError(errorInfo)) {
            skippedDuplicates++;
            try {
              const merged = await mergeDuplicateSessionData({
                studentId: currentStudentId,
                date: firstRow.data,
                time: firstRow.hora,
                exercises,
              });
              if (merged > 0) {
                mergedDuplicates += merged;
              }
            } catch (mergeError: unknown) {
              const mergeMessage = buildErrorDescription(
                mergeError,
                "falha ao atualizar exercícios de sessão duplicada"
              );
              errors.push(`Sessão ${key}: duplicada ignorada, ${mergeMessage}.`);
              logger.warn("[ImportSessionsDialog] Failed to merge duplicate session data", mergeError);
            }
          } else {
            const description = buildErrorDescription(errorInfo);
            errors.push(`Sessão ${key}: ${description}`);
          }

          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  attempted,
                  processed,
                  mergedDuplicates,
                  skippedDuplicates,
                  errors,
                }
              : prev
          );
        }
      }

      // Toast final
      toast.dismiss(toastId);

      if (processed > 0 || mergedDuplicates > 0) {
        invalidateAfterImport().catch((error) => {
          logger.warn("[ImportSessionsDialog] Failed to invalidate caches after import", error);
          toast("Importação concluída, mas a tela pode demorar para atualizar", {
            description: "Reabra a página de sessões ou atualize o dashboard para refletir os dados recentes.",
            duration: 6000,
          });
        });
      }
      
      if (errors.length === 0 && skippedDuplicates === 0) {
        toast.success("Importação concluída com sucesso!", {
          description: `${processed} sessão(ões) importada(s) com ${validRows} linha(s) válida(s).`,
          duration: 5000,
        });
      } else if (errors.length === 0 && processed === 0 && skippedDuplicates > 0) {
        toast("Importação concluída sem novas sessões", {
          description:
            mergedDuplicates > 0
              ? `${skippedDuplicates} sessão(ões) duplicadas ignoradas, ${mergedDuplicates} exercício(s) existente(s) atualizado(s).`
              : `${skippedDuplicates} sessão(ões) já existiam e foram ignoradas.`,
          duration: 6000,
        });
      } else {
        toast("Importação concluída com pendências", {
          description: `${processed} importada(s), ${skippedDuplicates} duplicada(s) ignorada(s), ${mergedDuplicates} exercício(s) atualizado(s), ${errors.length} erro(s).`,
          duration: 7000,
        });
      }

      setStatus({
        total: totalSessions,
        attempted,
        processed,
        mergedDuplicates,
        skippedDuplicates,
        errors,
        success: errors.length === 0 && skippedDuplicates === 0,
      });
    } catch (error: unknown) {
      if (toastId) toast.dismiss(toastId);
      
      const message = buildErrorDescription(error);
      
      toast.error("Erro ao processar arquivo", {
        description: message || "Verifique o formato do arquivo Excel e tente novamente.",
      });
      
      setStatus({
        total: 0,
        attempted: 0,
        processed: 0,
        mergedDuplicates: 0,
        skippedDuplicates: 0,
        errors: [message],
        success: false,
      });
    } finally {
      setProcessing(false);
    }
  };

  const resetDialog = () => {
    setFile(null);
    setStatus(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Sessões via Excel
          </DialogTitle>
          <DialogDescription>
            Faça upload de uma planilha Excel (.xlsx ou .xls) com os dados das sessões.
            <br />
            <strong>Colunas necessárias:</strong> Aluno, Data, Hora, Exercicio, Series, Reps, Carga, Observacoes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          {!status && (
            <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="excel-upload"
                disabled={processing}
              />
              <label
                htmlFor="excel-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {file ? file.name : "Clique para selecionar arquivo Excel"}
                </p>
              </label>
            </div>
          )}

          {/* Processing status */}
          {processing && status && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Processando sessões...</span>
                <span className="font-medium">
                  {status.attempted} / {status.total}
                </span>
              </div>
              <Progress value={status.total > 0 ? (status.attempted / status.total) * 100 : 0} />
            </div>
          )}

          {/* Results */}
          {!processing && status && (
            <div className="space-y-3">
              {status.success ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Importação concluída com sucesso!</strong>
                    <br />
                    {status.processed} sessão(ões) importada(s).
                  </AlertDescription>
                </Alert>
              ) : status.errors.length === 0 && status.skippedDuplicates > 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Importação concluída sem novas sessões</strong>
                    <br />
                    {status.skippedDuplicates} sessão(ões) já existiam e foram ignoradas.
                    {status.mergedDuplicates > 0 && (
                      <>
                        <br />
                        {status.mergedDuplicates} exercício(s) existente(s) foram atualizados com dados faltantes.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Importação concluída com erros</strong>
                    <br />
                    {status.processed} importada(s), {status.skippedDuplicates} duplicada(s) ignorada(s), {status.mergedDuplicates} exercício(s) atualizado(s), {status.errors.length} erro(s).
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div className="rounded-md border border-destructive/20 bg-background/60 p-2">
                        <p className="text-muted-foreground">Importadas</p>
                        <p className="text-base font-semibold">{status.processed}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-background/60 p-2">
                        <p className="text-muted-foreground">Duplicadas</p>
                        <p className="text-base font-semibold">{status.skippedDuplicates}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-background/60 p-2">
                        <p className="text-muted-foreground">Atualizadas</p>
                        <p className="text-base font-semibold">{status.mergedDuplicates}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-background/60 p-2">
                        <p className="text-muted-foreground">Erros</p>
                        <p className="text-base font-semibold">{status.errors.length}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {categorizeImportErrors(status.errors).map((group) => (
                        <div key={group.key} className="rounded-md border border-destructive/30 bg-background/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{group.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{group.action}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold">
                              {group.errors.length}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            Exemplo: {group.errors[0]}
                          </p>
                        </div>
                      ))}
                    </div>
                    <details className="mt-3 rounded-md border border-destructive/20 bg-background/60 p-3">
                      <summary className="cursor-pointer text-xs font-medium">
                        Ver detalhes técnicos
                      </summary>
                      <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                        {status.errors.map((error, i) => (
                          <div key={i} className="mt-1 break-words">
                            • {error}
                          </div>
                        ))}
                      </div>
                    </details>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetDialog} disabled={processing}>
              {status ? "Fechar" : "Cancelar"}
            </Button>
            {!status && (
              <Button onClick={processFile} disabled={!file || processing}>
                {processing ? "Processando..." : "Importar"}
              </Button>
            )}
          </div>

          {/* Instructions */}
          {!status && (
            <div className="text-xs text-muted-foreground border-t pt-4 space-y-2">
              <p><strong>Formato da planilha:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Cada linha representa um exercício de uma sessão</li>
                <li>Múltiplas linhas com mesmo Aluno + Data + Hora = mesma sessão</li>
                <li>Alunos não cadastrados serão criados automaticamente</li>
                <li>Data: formato DD/MM/AAAA ou AAAA-MM-DD</li>
                <li>Hora: formato HH:MM</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
