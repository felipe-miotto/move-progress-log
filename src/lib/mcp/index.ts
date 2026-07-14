import { auth, defineMcp } from "@lovable.dev/mcp-js";
import runReadonlyQuery from "./tools/run-readonly-query";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fabrik-mcp",
  title: "Fabrik Performance (read-only)",
  version: "0.1.0",
  instructions:
    "Read-only SQL access to the Fabrik Performance database as the signed-in user. Use `run_readonly_query` to run a single SELECT/WITH/EXPLAIN SELECT statement. RLS is enforced — results are scoped to what the connected user can see. DDL/DML, multi-statement input, SET, COPY, and unsafe server functions are rejected. Transactions are READ ONLY with a 15s statement timeout and a hard cap of 5000 rows.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [runReadonlyQuery],
});
