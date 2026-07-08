// Hardened OAuth-state validation shared across wearable providers.
// Ported from oura-callback (controls OCB-01..OCB-09): validate the state's
// UUIDs, look up the invite, verify the student match + expiry, and atomically
// claim `is_used` BEFORE the token exchange (replay/race protection). The
// `student_invites` table is shared across providers, so this is provider-agnostic.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedState {
  student_id: string;
  invite_id: string;
  encodedOrigin: string | null;
}

// State echoes back via the provider's OAuth redirect — treat as untrusted.
export function parseState(state: string): ParsedState {
  const [student_id, invite_id, encodedOrigin] = (state ?? "").split(":");
  if (!student_id || !UUID_RE.test(student_id)) throw new Error("invalid student_id in state");
  // 'retry' was a deprecated marker that bypassed expiry/replay checks — reject it.
  if (!invite_id || invite_id === "retry" || !UUID_RE.test(invite_id)) throw new Error("invalid invite_id in state");
  return { student_id, invite_id, encodedOrigin: encodedOrigin ?? null };
}

export interface ClaimedInvite {
  id: string;
  invite_token: string;
  created_student_id: string | null;
  expires_at: string | null;
}

// Atomically claim the invite (is_used false->true, not expired) so a replayed
// state sees is_used=true and is rejected. Throws on not-found/mismatch/expired/race.
// deno-lint-ignore no-explicit-any
export async function claimInvite(supa: any, invite_id: string, student_id: string): Promise<ClaimedInvite> {
  const { data: invite, error } = await supa
    .from("student_invites")
    .select("id, invite_token, created_student_id, expires_at, is_used")
    .eq("id", invite_id)
    .single();
  if (error || !invite) throw new Error("invite not found");
  if (invite.created_student_id && invite.created_student_id !== student_id) throw new Error("state mismatch");

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supa
    .from("student_invites")
    .update({ is_used: true })
    .eq("id", invite_id)
    .eq("is_used", false)
    .gt("expires_at", nowIso)
    .select("id, invite_token, created_student_id, expires_at")
    .single();
  if (claimErr || !claimed) throw new Error("invite expired/used/race");
  return claimed as ClaimedInvite;
}

// Recoverable failures after the claim (token exchange / DB error) release the
// invite so the user can retry through the original link.
// deno-lint-ignore no-explicit-any
export async function releaseInvite(supa: any, invite_id: string): Promise<void> {
  await supa.from("student_invites").update({ is_used: false }).eq("id", invite_id);
}
