#!/usr/bin/env bash
#
# Edge-function type gate (CI guard parity).
#
# Why this exists: the project's `tsc --noEmit` does NOT cover
# `supabase/functions/**` — those run on Deno, outside the app tsconfig — and
# the edge tests are mostly source-based (regex over the source, not runtime).
# That gap let PR #195 ship a ReferenceError in `oura-callback` (an undeclared
# `invite_token`) with a green CI. This script closes the gap: it runs
# `deno check` over every edge function so a type error like that fails CI.
#
# Dep pinning: most functions import `esm.sh/@supabase/supabase-js@2` (a floating
# major) — the dep that drives these diagnostics. Left unpinned, esm.sh resolves
# "latest 2.x at request time" and a future patch could change the error count.
# So we type-check against the committed `deno.lock`, which redirects `@2 ->
# 2.98.0` with an integrity hash, pinning that dominant dep. We run against a
# throwaway COPY of the lock (`--lock=<tmp>`) so the gate never mutates the
# committed lockfile (and can't perturb edge deploy); setup-deno's cache key is
# that same committed lock, so cache and runtime stay coherent. NOTE: this is not
# a fully frozen graph — a few imports (e.g. supabase-js@2.45.0, zod@3.25.76) are
# not in the lock and resolve into the throwaway copy. That is why the baseline
# keys on error COUNT + an anchor substring (the stable invariants), not the
# exact TS code set.
#
# Ratchet baseline: a few functions currently fail `deno check` due to
# pre-existing type debt (untyped Supabase client -> `never`, a missing optional
# field type, a dead @ts-expect-error). They are quarantined below, keyed by the
# error COUNT plus a required message substring (anchor). We key on count, not
# the exact TS code set: transitive esm.sh builds are not all integrity-locked,
# so the resolver can pick TS2769 vs TS2353 for the same `never`-typed insert;
# the count and the anchor text are stable. The gate is strict on everything
# else:
#   - a non-baselined function that fails        -> FAIL (new regression)
#   - a baselined function whose count changes    -> FAIL (debt changed; update it)
#   - a baselined function whose anchor msg is gone-> FAIL (different bug; verify)
#   - a baselined function that now PASSES         -> FAIL (fixed; remove it)
#   - a function directory without an index.ts     -> FAIL (uncovered entrypoint)
# `oura-callback` leaves the baseline when Action 2 fixes the bug.
#
# Portable to bash 3.2 (macOS default) and bash 5 (CI). Needs `deno` on PATH.
# Run: bash ./scripts/deno-check-edge-functions.sh

set -uo pipefail

FUNCTIONS_DIR="supabase/functions"

if ! command -v deno >/dev/null 2>&1; then
  echo "[edge-types] FAIL: deno not found on PATH"
  exit 1
fi

# Expected `deno check` error count for each known-failing function. Empty =
# not baselined (any failure is treated as a new regression). Pinned to the
# Deno 2.8.3 / TS 6.0.3 toolchain and @supabase/supabase-js@2.98.0 (via deno.lock).
baseline_count() {
  case "$1" in
    create-student-from-invite)       echo "6" ;;
    oura-sync-test)                   echo "1" ;;
    smoke-test-integrity)             echo "1" ;;
    submit-precision12-questionnaire) echo "1" ;;
    *)                                echo "" ;;
  esac
}

# Required substring in the diagnostics, so the baseline tracks the *specific*
# known bug, not any lookalike with the same error count. Every baselined
# function MUST have an anchor (enforced below). Empty = not baselined.
baseline_msg() {
  case "$1" in
    create-student-from-invite)       echo "type 'never'" ;;
    oura-sync-test)                   echo "temperature_deviation" ;;
    smoke-test-integrity)             echo "string | undefined" ;;
    submit-precision12-questionnaire) echo "ts-expect-error" ;;
    *)                                echo "" ;;
  esac
}

short_reason() {
  case "$1" in
    create-student-from-invite)       echo "untyped Supabase client -> never on update/insert" ;;
    oura-sync-test)                   echo "missing optional Oura contributor field (guarded by ?.)" ;;
    smoke-test-integrity)             echo "fetch url possibly-undefined (env-guarded, not a live route)" ;;
    submit-precision12-questionnaire) echo "dead @ts-expect-error directive" ;;
    *)                                echo "tracked type debt" ;;
  esac
}

# Type-check against a throwaway copy of the committed lockfile, so the gate
# never mutates deno.lock while still honoring its @2 -> 2.98.0 pin.
LOCK_ARGS=(--no-lock)
LOCK_COPY=""
if [[ -f deno.lock ]]; then
  LOCK_COPY="$(mktemp)" || { echo "[edge-types] FAIL: could not create temp lockfile"; exit 1; }
  trap 'rm -f "$LOCK_COPY"' EXIT
  cp deno.lock "$LOCK_COPY" || { echo "[edge-types] FAIL: could not copy deno.lock to temp lockfile"; exit 1; }
  LOCK_ARGS=(--lock="$LOCK_COPY")
else
  echo "[edge-types] WARN: deno.lock not found — checking without a lock (non-deterministic dep resolution)"
fi

# Every function directory (excluding _shared and other _-prefixed helpers) must
# have an index.ts entrypoint, so a new function can't slip past the gate.
missing_entry=()
for d in "$FUNCTIONS_DIR"/*/; do
  name="$(basename "$d")"
  case "$name" in _*) continue ;; esac
  [[ -f "${d}index.ts" ]] || missing_entry+=("$name")
done
if [[ ${#missing_entry[@]} -gt 0 ]]; then
  echo "[edge-types] FAIL: function directory without index.ts (add one or rename to _-prefixed helper):"
  for m in "${missing_entry[@]}"; do echo "  - $m"; done
  exit 1
fi

ENTRYPOINTS=()
while IFS= read -r f; do
  ENTRYPOINTS+=("$f")
done < <(find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -name index.ts | sort)

if [[ ${#ENTRYPOINTS[@]} -eq 0 ]]; then
  echo "[edge-types] FAIL: no edge function entrypoints found under $FUNCTIONS_DIR"
  exit 1
fi

checked=0
healthy=0
fail=0
debt_lines=()
fail_lines=()

for file in "${ENTRYPOINTS[@]}"; do
  fn="$(basename "$(dirname "$file")")"
  checked=$((checked + 1))

  out="$(NO_COLOR=1 deno check -q "${LOCK_ARGS[@]}" "$file" 2>&1)"
  rc=$?

  codes="$(printf '%s\n' "$out" | grep -oE 'TS[0-9]+' | sort -u | paste -sd, -)"
  count="$(printf '%s\n' "$out" | grep -oE 'TS[0-9]+' | wc -l | tr -d ' ')"

  expected="$(baseline_count "$fn")"

  if [[ $rc -eq 0 ]]; then
    if [[ -n "$expected" ]]; then
      fail=$((fail + 1))
      fail_lines+=("$fn: baselined but now PASSES deno check — remove it from baseline_count()/baseline_msg() in this script (ratchet)")
    else
      healthy=$((healthy + 1))
    fi
    continue
  fi

  # rc != 0 -> deno check failed for this function
  if [[ -z "$expected" ]]; then
    fail=$((fail + 1))
    fail_lines+=("$fn: NEW deno check error(s) [$count: $codes] — not in baseline")
    fail_lines+=("$(printf '%s\n' "$out" | grep -E 'TS[0-9]+' | sed 's/^/        /')")
    continue
  fi

  if [[ "$count" != "$expected" ]]; then
    fail=$((fail + 1))
    fail_lines+=("$fn: baseline DRIFT — expected $expected error(s), got $count [$codes]; update baseline_count() if intended")
    continue
  fi

  msg="$(baseline_msg "$fn")"
  if [[ -z "$msg" ]]; then
    fail=$((fail + 1))
    fail_lines+=("$fn: baselined by count but has no anchor message — add one to baseline_msg()")
    continue
  fi
  if ! printf '%s\n' "$out" | grep -qF "$msg"; then
    fail=$((fail + 1))
    fail_lines+=("$fn: count matched but anchor message '$msg' is gone — verify the known bug, not a lookalike")
    continue
  fi

  debt_lines+=("$fn [$count: $codes] — $(short_reason "$fn")")
done

echo "[edge-types] checked $checked edge function(s): $healthy healthy, ${#debt_lines[@]} known-debt, $fail unexpected."

if [[ ${#debt_lines[@]} -gt 0 ]]; then
  echo "[edge-types] known type debt (quarantined, tracked — NOT a silent cap):"
  for l in "${debt_lines[@]}"; do echo "    - $l"; done
fi

if [[ $fail -gt 0 ]]; then
  echo "[edge-types] FAIL:"
  for l in "${fail_lines[@]}"; do echo "  - $l"; done
  exit 1
fi

echo "[edge-types] PASS: no new edge-function type errors; baseline intact."
