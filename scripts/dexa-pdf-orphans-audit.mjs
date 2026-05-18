#!/usr/bin/env node
/**
 * Auditoria de PDFs ÓRFÃOS no bucket privado `dexa-pdfs`.
 *
 * Por que existe:
 *   O coach faz vários uploads/testes ao montar uma avaliação DEXA
 *   (cada clique em "Ler PDF e preencher campos" sobe um arquivo novo
 *   pra trigger da extração). Se ele clicar "Limpar" e re-anexar outro
 *   arquivo, o anterior fica no bucket sem registro em `dexa_results`.
 *   Esse script identifica os "órfãos" (bucket-sem-DB) e — só com flag
 *   explícita — apaga. NUNCA toca em arquivos referenciados em
 *   `dexa_results.scan_pdf_storage_path`.
 *
 * Modo padrão: DRY-RUN. Lista o que SERIA deletado, sem deletar nada.
 *
 * Segurança:
 *   - SERVICE ROLE key obrigatória (lê bucket privado + DB sem RLS).
 *   - Threshold de idade padrão: 24h. Configurável via env. Arquivos
 *     mais novos NÃO entram na lista mesmo se órfãos — protege upload
 *     em andamento que ainda não virou linha em `dexa_results`.
 *   - Set difference é a base: `bucket_paths - referenced_paths`.
 *     Arquivo referenciado JAMAIS é candidato a delete.
 *   - Output sanitizado: UUIDs mascarados pra `[xxxxxxxx]`, sem nomes
 *     de aluno, sem signed URLs, sem tokens, sem PDF bytes.
 *   - Exige `--confirm-delete` (flag, não env var, não default) pra
 *     executar o delete real.
 *
 * Uso (dry-run):
 *   SUPABASE_URL=https://<proj>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/dexa-pdf-orphans-audit.mjs
 *
 * Uso (com threshold custom em horas):
 *   DEXA_ORPHAN_AGE_THRESHOLD_HOURS=48 node scripts/dexa-pdf-orphans-audit.mjs
 *
 * Uso (apagar de verdade — APÓS revisar o dry-run):
 *   node scripts/dexa-pdf-orphans-audit.mjs --confirm-delete
 *
 * NÃO faz parte do app. NÃO roda em CI. Standalone admin tool.
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Mensagem fixa pro `main().catch`. Não inclui `e.message` porque a
 * mensagem do erro pode revelar URL/token/path/stack. Diagnóstico
 * server-side fica nos logs do Supabase Dashboard.
 */
const AUDIT_GENERIC_FAILURE_MESSAGE =
  "Auditoria falhou. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.";

const BUCKET_ID = "dexa-pdfs";

/**
 * Default 24h: janela conservadora pra não pegar uploads em curso
 * que ainda não viraram linha em `dexa_results` (ex.: coach abriu o
 * form, fez upload, IA está processando, ainda não salvou).
 */
const DEFAULT_AGE_THRESHOLD_HOURS = 24;
const MIN_AGE_THRESHOLD_HOURS = 1;
const MAX_AGE_THRESHOLD_HOURS = 24 * 30; // 30 dias

const CONFIRM_DELETE_FLAG = "--confirm-delete";

/**
 * Mascara UUID v4 pra mostrar só os 8 primeiros chars + "[…]". Não
 * vaza o UUID inteiro do aluno em log/output, mas mantém prefixo
 * suficiente pra correlacionar manualmente se necessário.
 */
function maskUuidLike(value) {
  if (typeof value !== "string") return "[?]";
  // Formato esperado: `<student_uuid>/<timestamp>-<random_uuid>.pdf`.
  // Mascaramos as duas partes UUID, preservamos só o timestamp como
  // sinal temporal útil.
  return value.replace(
    /([0-9a-f]{8})[0-9a-f-]{20,30}/gi,
    (_match, prefix) => `[${prefix}…]`,
  );
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseThresholdHours() {
  const raw = process.env.DEXA_ORPHAN_AGE_THRESHOLD_HOURS;
  if (raw === undefined || raw === "") return DEFAULT_AGE_THRESHOLD_HOURS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_AGE_THRESHOLD_HOURS) {
    throw new Error(
      `DEXA_ORPHAN_AGE_THRESHOLD_HOURS deve ser >= ${MIN_AGE_THRESHOLD_HOURS}h.`,
    );
  }
  if (parsed > MAX_AGE_THRESHOLD_HOURS) {
    throw new Error(
      `DEXA_ORPHAN_AGE_THRESHOLD_HOURS deve ser <= ${MAX_AGE_THRESHOLD_HOURS}h.`,
    );
  }
  return parsed;
}

/**
 * Lista TODOS os objetos do bucket `dexa-pdfs`, paginando por prefixo
 * de student (primeiro nível). Storage API requer listagem por path
 * (não tem "list everything recursive" nativo), então fazemos
 * 2 níveis: primeiro lista pastas (= student UUIDs), depois lista
 * objetos dentro de cada pasta.
 */
async function listAllBucketObjects(admin) {
  const collected = [];
  const PAGE_SIZE = 1000;

  // 1) Lista pastas no root do bucket (cada pasta = um student_id).
  let folderOffset = 0;
  const folderNames = [];
  while (true) {
    const { data, error } = await admin.storage
      .from(BUCKET_ID)
      .list("", { limit: PAGE_SIZE, offset: folderOffset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      // Pastas em Supabase Storage aparecem com `id === null` e
      // `metadata === null`. Arquivos no root teriam id; ignoramos
      // qualquer arquivo no root (não é o nosso layout).
      if (entry && entry.id === null) {
        folderNames.push(entry.name);
      }
    }
    if (data.length < PAGE_SIZE) break;
    folderOffset += data.length;
  }

  // 2) Lista arquivos dentro de cada pasta.
  for (const folder of folderNames) {
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage
        .from(BUCKET_ID)
        .list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const obj of data) {
        // `id !== null` indica arquivo (não subpasta).
        if (obj && obj.id !== null && obj.name) {
          collected.push({
            path: `${folder}/${obj.name}`,
            createdAt: obj.created_at ? new Date(obj.created_at).getTime() : null,
            size: obj.metadata?.size ?? null,
          });
        }
      }
      if (data.length < PAGE_SIZE) break;
      offset += data.length;
    }
  }
  return collected;
}

/**
 * Lê todos os `scan_pdf_storage_path` não-nulos de `dexa_results`.
 * Retorna `Set<string>` pra lookup O(1) na hora do diff.
 */
async function listReferencedPaths(admin) {
  const referenced = new Set();
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("dexa_results")
      .select("scan_pdf_storage_path")
      .not("scan_pdf_storage_path", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const p = row?.scan_pdf_storage_path;
      if (typeof p === "string" && p.trim().length > 0) {
        referenced.add(p.trim());
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += data.length;
  }
  return referenced;
}

/**
 * Calcula o set de candidatos a delete:
 *   - presente no bucket
 *   - AUSENTE de `dexa_results.scan_pdf_storage_path`
 *   - mais antigo que o threshold
 *
 * Função pura — testável sem mocks.
 */
export function selectOrphanCandidates({
  bucketObjects,
  referencedPaths,
  nowMs,
  thresholdMs,
}) {
  const cutoff = nowMs - thresholdMs;
  const candidates = [];
  let referencedCount = 0;
  let tooYoungCount = 0;
  for (const obj of bucketObjects) {
    if (referencedPaths.has(obj.path)) {
      referencedCount += 1;
      continue;
    }
    // Sem timestamp confiável → conservador, NÃO inclui (pode ser
    // upload em andamento ou metadata indisponível).
    if (typeof obj.createdAt !== "number" || !Number.isFinite(obj.createdAt)) {
      tooYoungCount += 1;
      continue;
    }
    if (obj.createdAt > cutoff) {
      tooYoungCount += 1;
      continue;
    }
    candidates.push(obj);
  }
  return { candidates, referencedCount, tooYoungCount };
}

async function deleteOrphans(admin, candidates) {
  // API do Storage aceita batch de paths.
  const paths = candidates.map((c) => c.path);
  const BATCH_SIZE = 100;
  let totalDeleted = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const { data, error } = await admin.storage.from(BUCKET_ID).remove(batch);
    if (error) throw error;
    totalDeleted += Array.isArray(data) ? data.length : 0;
  }
  return totalDeleted;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (admin).",
    );
  }

  const argv = process.argv.slice(2);
  const confirmDelete = argv.includes(CONFIRM_DELETE_FLAG);
  const thresholdHours = parseThresholdHours();
  const thresholdMs = thresholdHours * 3_600_000;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("=== DEXA PDF Orphans Audit ===");
  console.log(`Bucket:              ${BUCKET_ID}`);
  console.log(`Threshold:           older than ${thresholdHours}h`);
  console.log(`Mode:                ${confirmDelete ? "DELETE (real)" : "DRY-RUN"}`);
  console.log("");

  const [bucketObjects, referencedPaths] = await Promise.all([
    listAllBucketObjects(admin),
    listReferencedPaths(admin),
  ]);

  console.log(`Bucket objects:      ${bucketObjects.length}`);
  console.log(`Referenced in DB:    ${referencedPaths.size}`);

  const now = Date.now();
  const { candidates, referencedCount, tooYoungCount } = selectOrphanCandidates({
    bucketObjects,
    referencedPaths,
    nowMs: now,
    thresholdMs,
  });

  console.log(`Skipped (referenced):${referencedCount}`);
  console.log(`Skipped (too young): ${tooYoungCount}`);
  console.log(`Orphans to process:  ${candidates.length}`);
  console.log("");

  if (candidates.length === 0) {
    console.log("Nada a fazer. Saindo.");
    return;
  }

  const totalSize = candidates.reduce(
    (acc, c) => acc + (typeof c.size === "number" ? c.size : 0),
    0,
  );

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    const ageMs = typeof c.createdAt === "number" ? now - c.createdAt : NaN;
    // Output sanitizado — só posição + age + size + path mascarado.
    console.log(
      `[#${String(i + 1).padStart(3, "0")}] ${maskUuidLike(c.path)} | age: ${formatAge(ageMs)} | size: ${formatBytes(c.size)}`,
    );
  }

  console.log("");
  console.log(`Total: ${candidates.length} órfãos | ${formatBytes(totalSize)}`);

  if (!confirmDelete) {
    console.log("");
    console.log(
      `DRY-RUN: nada foi apagado. Pra apagar de verdade, re-rode com ${CONFIRM_DELETE_FLAG}.`,
    );
    return;
  }

  // Modo delete real — guard extra: nenhuma das paths pode estar em
  // `referencedPaths`. Defesa em profundidade (já garantido pelo
  // `selectOrphanCandidates`, mas barato e seguro re-verificar).
  for (const c of candidates) {
    if (referencedPaths.has(c.path)) {
      throw new Error(
        "Guard tripped: candidato a delete está referenciado em dexa_results. Abortando.",
      );
    }
  }

  console.log("");
  console.log(`Deletando ${candidates.length} órfão(s)...`);
  const deleted = await deleteOrphans(admin, candidates);
  console.log(`OK. ${deleted} objeto(s) removido(s) do bucket.`);
}

// Em ambiente de teste (Vitest importa o módulo), não rodar main —
// só queremos as funções exportadas pra checagem source-based.
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? "");

if (isMainModule) {
  main().catch(() => {
    console.error(AUDIT_GENERIC_FAILURE_MESSAGE);
    process.exit(1);
  });
}
