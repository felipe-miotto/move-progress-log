import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Blocklist of forbidden top-level keywords (any occurrence outside strings/comments).
const FORBIDDEN = [
  "insert",
  "update",
  "delete",
  "merge",
  "alter",
  "drop",
  "create",
  "grant",
  "revoke",
  "truncate",
  "copy",
  "vacuum",
  "reindex",
  "cluster",
  "call",
  "do",
  "listen",
  "notify",
  "lock",
  "comment",
  "security",
  "set",
  "reset",
];

// Strip SQL string literals and comments so keyword matching only sees code.
function stripLiteralsAndComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    // -- line comment
    if (c === "-" && next === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    // /* block comment */
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    // 'single-quoted string' (handles doubled '' escape)
    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += " '' ";
      continue;
    }
    // "double-quoted identifier" — keep as-is (identifiers, not strings)
    out += c;
    i++;
  }
  return out;
}

function validateReadOnly(sql: string): string | null {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return "Empty query";
  // Reject multiple statements
  const stripped = stripLiteralsAndComments(trimmed);
  if (stripped.includes(";")) return "Multiple statements are not allowed";
  const lower = " " + stripped.toLowerCase().replace(/\s+/g, " ") + " ";
  // Must START with select or with
  const startsOk = /^\s*(select|with|explain\s+select|explain\s+with|table|values)\b/i.test(trimmed);
  if (!startsOk) return "Query must start with SELECT, WITH, TABLE, VALUES, or EXPLAIN SELECT/WITH";
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`(^|[^a-z0-9_])${kw}([^a-z0-9_]|$)`, "i");
    if (re.test(stripped)) return `Forbidden keyword: ${kw.toUpperCase()}`;
  }
  // Extra guard: block pg_catalog write funcs / dblink / copy variants
  if (/\b(pg_read_server_files|pg_write_server_files|dblink|lo_import|lo_export|pg_terminate_backend|pg_cancel_backend|pg_reload_conf)\b/i.test(stripped)) {
    return "Forbidden server-side function";
  }
  return null;
}

// Deno is available at runtime inside the emitted edge function; the app-side
// TS build doesn't know that type, so read it through globalThis.
declare const Deno: { env: { get(name: string): string | undefined } };

function supabaseForUser(ctx: ToolContext) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const MAX_ROWS = 5000;

export default defineTool({
  name: "run_readonly_query",
  title: "Run read-only SQL query",
  description:
    "Execute a single read-only SQL statement (SELECT / WITH / EXPLAIN SELECT) against the app database as the signed-in user. RLS applies — you see only what the user is allowed to see. Rejects any DDL/DML (INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/GRANT/TRUNCATE/COPY/SET/...), multiple statements, and unsafe server functions. Wrapped in a READ ONLY transaction with a 15s statement timeout and hard cap of 5000 rows.",
  inputSchema: {
    sql: z.string().min(1).describe("A single SELECT/WITH/EXPLAIN SELECT statement. No trailing semicolons required; multi-statement input is rejected."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sql }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const violation = validateReadOnly(sql);
    if (violation) {
      return { content: [{ type: "text", text: `Rejected: ${violation}` }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    // Call a security-invoker RPC that wraps the query in READ ONLY tx + timeout + limit.
    const { data, error } = await supabase.rpc("mcp_run_readonly_query", {
      p_sql: sql,
      p_max_rows: MAX_ROWS,
      p_timeout_ms: 15000,
    });

    if (error) {
      return {
        content: [{ type: "text", text: `Query error: ${error.message}` }],
        isError: true,
      };
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const truncated = rows.length >= MAX_ROWS;
    const payload = { row_count: rows.length, truncated, rows };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
