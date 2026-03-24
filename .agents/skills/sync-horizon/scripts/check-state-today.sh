#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=${1:-/Users/adam/dev/incept5/eve-skillpacks}
CDIR=${WORKSPACE}/eve-work/eve-read-eve-docs
FAILED=0

report() {
  echo "[state-today] $1"
}

assert_no_matches() {
  local pattern=$1
  shift
  if rg -n "${pattern}" "$@" >/tmp/state-today-rg.out; then
    echo
    echo "[FAIL] Found disallowed content for pattern: ${pattern}"
    cat /tmp/state-today-rg.out
    FAILED=1
  else
    report "PASS: no matches for ${pattern}"
  fi
}

assert_file_exists() {
  local path=$1
  if [ ! -f "${path}" ]; then
    echo "[FAIL] Missing required file: ${path}"
    FAILED=1
  else
    report "PASS: found ${path}"
  fi
}

assert_heading() {
  local path=$1
  local heading=$2
  if ! rg -n -F "${heading}" "${path}" >/dev/null; then
    echo "[FAIL] Missing heading '${heading}' in ${path}"
    FAILED=1
  else
    report "PASS: ${path} has ${heading}"
  fi
}

cd "${WORKSPACE}"

# State-today filtering guard
assert_no_matches "Planned \\(Not Implemented\\)|## Planned|What's next|current vs planned|Planned vs Current" "${CDIR}" -g '*.md'
assert_no_matches "Planned \\(Not Implemented\\)|## Planned|What's next|current vs planned|Planned vs Current" \
  "${CDIR}/references/cli-auth.md" \
  "${CDIR}/references/cli-org-project.md" \
  "${CDIR}/references/cli-jobs.md" \
  "${CDIR}/references/cli-pipelines.md" \
  "${CDIR}/references/cli-deploy-debug.md"

# Progressive-access router checks
assert_heading "${CDIR}/references/overview.md" "## Use When"
assert_heading "${CDIR}/references/jobs.md" "## Load Next"
assert_heading "${WORKSPACE}/eve-work/eve-read-eve-docs/SKILL.md" "## Task Router (Progressive Access)"
assert_heading "${WORKSPACE}/eve-work/eve-read-eve-docs/SKILL.md" "## Intent Coverage Matrix"

# Ensure CLI task modules for split references exist
for module in cli-auth.md cli-org-project.md cli-jobs.md cli-pipelines.md cli-deploy-debug.md; do
  assert_file_exists "${CDIR}/references/${module}"
done

# Ensure every cli task module follows progressive-access entry format
for module in "${CDIR}/references/cli-auth.md" "${CDIR}/references/cli-org-project.md" "${CDIR}/references/cli-jobs.md" "${CDIR}/references/cli-pipelines.md" "${CDIR}/references/cli-deploy-debug.md"; do
  assert_heading "${module}" "## Use When"
  assert_heading "${module}" "## Load Next"
  assert_heading "${module}" "## Ask If Missing"
done

if [ ${FAILED} -ne 0 ]; then
  printf '\n[state-today] Compliance check FAILED\n'
  exit 1
fi

printf '\n[state-today] Compliance check PASSED\n'
