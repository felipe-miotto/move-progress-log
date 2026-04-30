#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/5] Lint"
npm run lint

echo "==> [2/5] Tests"
npm run test

echo "==> [3/5] Build"
npm run build

echo "==> [4/5] Edge auth guard audit"
bash ./scripts/verify-edge-auth-guards.sh

echo "==> [5/5] Security audit (high)"
AUDIT_OUTPUT_FILE="$(mktemp)"
set +e
npm audit --audit-level=high >"${AUDIT_OUTPUT_FILE}" 2>&1
AUDIT_EXIT_CODE=$?
set -e

if [ "${AUDIT_EXIT_CODE}" -eq 0 ]; then
  cat "${AUDIT_OUTPUT_FILE}"
else
  cat "${AUDIT_OUTPUT_FILE}"
  if grep -qiE "ENOTFOUND|audit endpoint returned an error|request to .*security.* failed|getaddrinfo" "${AUDIT_OUTPUT_FILE}"; then
    if [ "${CI:-}" = "true" ]; then
      echo "[verify-essential] FAIL: npm audit unavailable in CI environment."
      rm -f "${AUDIT_OUTPUT_FILE}"
      exit 1
    fi
    echo "[verify-essential] WARN: npm audit unavailable (network/registry issue). Skipping security gate locally."
  else
    echo "[verify-essential] FAIL: npm audit found vulnerabilities or returned a non-network error."
    rm -f "${AUDIT_OUTPUT_FILE}"
    exit "${AUDIT_EXIT_CODE}"
  fi
fi
rm -f "${AUDIT_OUTPUT_FILE}"

echo ""
echo "Essential automated gates: PASS"
