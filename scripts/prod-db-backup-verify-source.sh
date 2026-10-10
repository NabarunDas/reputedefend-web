#!/usr/bin/env bash
# Fail closed unless the checkout is exactly the approved commit and the
# reviewed runner files match their approved checksums. A branch name is not
# an execution source. This script is the CodeBuild trust boundary: the
# CloudFormation buildspec decodes this file and runs it before any repository
# script.
set -euo pipefail
set +x

: "${APPROVED_RUNNER_COMMIT:?Missing APPROVED_RUNNER_COMMIT}"
: "${APPROVED_RUNNER_SCRIPT_SHA256:?Missing APPROVED_RUNNER_SCRIPT_SHA256}"
: "${APPROVED_BACKUP_CLI_LOCK_SHA256:?Missing APPROVED_BACKUP_CLI_LOCK_SHA256}"
: "${REPOSITORY_CLONE_URL:?Missing REPOSITORY_CLONE_URL}"

CHECKOUT_DIR="${CHECKOUT_DIR:-repo}"
export GIT_TERMINAL_PROMPT=0

if [[ ! "$APPROVED_RUNNER_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: Approved runner commit must be a full 40-character lowercase hex SHA. Branch names are rejected."
  exit 2
fi
if [[ ! "$APPROVED_RUNNER_SCRIPT_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: Approved runner script checksum must be a 64-character lowercase hex SHA-256."
  exit 2
fi
if [[ ! "$APPROVED_BACKUP_CLI_LOCK_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: Approved backup CLI lock checksum must be a 64-character lowercase hex SHA-256."
  exit 2
fi
if [[ ! "$CHECKOUT_DIR" =~ ^[A-Za-z0-9._/-]+$ || "$CHECKOUT_DIR" == *..* || "$CHECKOUT_DIR" == /* ]]; then
  echo "ERROR: Checkout directory is not allowed."
  exit 2
fi

case "$APPROVED_RUNNER_COMMIT" in
  main|master|HEAD|head)
    echo "ERROR: Refusing to execute a branch tip."
    exit 2
    ;;
esac

rm -rf "$CHECKOUT_DIR"
git init --quiet "$CHECKOUT_DIR"
git -C "$CHECKOUT_DIR" remote add origin "$REPOSITORY_CLONE_URL"

if ! git -C "$CHECKOUT_DIR" -c protocol.version=2 fetch --quiet --depth 1 --no-tags origin "$APPROVED_RUNNER_COMMIT"; then
  echo "ERROR: Could not fetch the approved runner commit."
  rm -rf "$CHECKOUT_DIR"
  exit 2
fi

fetched="$(git -C "$CHECKOUT_DIR" rev-parse FETCH_HEAD)"
if [[ "$fetched" != "$APPROVED_RUNNER_COMMIT" ]]; then
  echo "ERROR: Fetched object does not match the approved runner commit."
  rm -rf "$CHECKOUT_DIR"
  exit 2
fi

if ! git -C "$CHECKOUT_DIR" checkout --detach --quiet "$APPROVED_RUNNER_COMMIT"; then
  echo "ERROR: Could not check out the approved runner commit."
  rm -rf "$CHECKOUT_DIR"
  exit 2
fi

head_sha="$(git -C "$CHECKOUT_DIR" rev-parse HEAD)"
if [[ "$head_sha" != "$APPROVED_RUNNER_COMMIT" ]]; then
  echo "ERROR: Checkout does not match the approved runner commit."
  rm -rf "$CHECKOUT_DIR"
  exit 2
fi

verify_file() {
  local relative="$1"
  local expected="$2"
  local path="$CHECKOUT_DIR/$relative"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: Approved commit is missing ${relative}."
    rm -rf "$CHECKOUT_DIR"
    exit 2
  fi
  local actual
  actual="$(sha256sum "$path" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: Checksum mismatch for ${relative}."
    rm -rf "$CHECKOUT_DIR"
    exit 2
  fi
}

verify_file "scripts/prod-db-backup-aws.sh" "$APPROVED_RUNNER_SCRIPT_SHA256"
verify_file "infra/aws/backup-cli/package-lock.json" "$APPROVED_BACKUP_CLI_LOCK_SHA256"

echo "Approved runner commit verified."
