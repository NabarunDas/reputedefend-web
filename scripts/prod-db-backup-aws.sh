#!/usr/bin/env bash
# Production logical backup runner.
# Execute only after scripts/prod-db-backup-verify-source.sh has pinned this
# file to an approved commit and checksum. Migration alignment uses
# APPROVED_MIGRATION_HEAD, not whichever migration file is newest in the checkout.
set +x
set -euo pipefail
umask 077
export AWS_PAGER=""
export DOCKER_CLI_HINTS=false

: "${SUPABASE_DB_URL:?Missing SUPABASE_DB_URL}"
: "${AWS_BACKUP_BUCKET:?Missing AWS_BACKUP_BUCKET}"
: "${AWS_REGION:?Missing AWS_REGION}"
: "${APPROVED_MIGRATION_HEAD:?Missing APPROVED_MIGRATION_HEAD}"
: "${APPROVED_RUNNER_COMMIT:?Missing APPROVED_RUNNER_COMMIT}"
: "${APPROVED_RUNNER_SCRIPT_SHA256:?Missing APPROVED_RUNNER_SCRIPT_SHA256}"
: "${APPROVED_BACKUP_CLI_LOCK_SHA256:?Missing APPROVED_BACKUP_CLI_LOCK_SHA256}"

if [[ ! "$APPROVED_MIGRATION_HEAD" =~ ^[0-9]{14}_[a-z0-9_]+$ ]]; then
  echo "ERROR: APPROVED_MIGRATION_HEAD must be a version_name migration id."
  exit 2
fi
if [[ ! "$APPROVED_RUNNER_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: APPROVED_RUNNER_COMMIT must be a full lowercase commit SHA."
  exit 2
fi
if [[ ! "$APPROVED_RUNNER_SCRIPT_SHA256" =~ ^[0-9a-f]{64}$ || ! "$APPROVED_BACKUP_CLI_LOCK_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: Approved runner checksums must be lowercase SHA-256 hex."
  exit 2
fi

script_path="$(readlink -f "$0")"
script_sha="$(sha256sum "$script_path" | awk '{print $1}')"
if [[ "$script_sha" != "$APPROVED_RUNNER_SCRIPT_SHA256" ]]; then
  echo "ERROR: Backup runner checksum does not match the approved checksum."
  exit 2
fi

head_sha="$(git rev-parse HEAD)"
if [[ "$head_sha" != "$APPROVED_RUNNER_COMMIT" ]]; then
  echo "ERROR: This checkout is not the approved runner commit."
  exit 2
fi

lock_path="infra/aws/backup-cli/package-lock.json"
if [[ ! -f "$lock_path" ]]; then
  echo "ERROR: Approved backup CLI lockfile is missing."
  exit 2
fi
lock_sha="$(sha256sum "$lock_path" | awk '{print $1}')"
if [[ "$lock_sha" != "$APPROVED_BACKUP_CLI_LOCK_SHA256" ]]; then
  echo "ERROR: Backup CLI lockfile checksum does not match the approved checksum."
  exit 2
fi

cred="$(mktemp -d /tmp/pr-db-backup-cred.XXXXXXXX)"
chmod 700 "$cred"
cleanup() {
  unset SUPABASE_DB_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE db_url || true
  rm -rf "$cred"
}
trap cleanup EXIT

python3 - "$cred" << 'PY'
import os, shlex, sys, urllib.parse
from pathlib import Path

def fail():
    print("ERROR: SUPABASE_DB_URL does not have the expected production Session Pooler shape.", file=sys.stderr)
    print("Store the entire percent-encoded postgresql:// connection string as the Secrets Manager secret plaintext value.", file=sys.stderr)
    raise SystemExit(2)

try:
    raw = os.environ.get("SUPABASE_DB_URL", "")
    parts = urllib.parse.urlparse(raw)
    prefix = "postgresql://postgres.cxwwekdzkkjjbiyofrov:"
    suffix = "@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
    fixture = os.environ.get("BACKUP_RUNNER_ALLOW_FIXTURE") == "1"
    production_shape = raw.startswith(prefix) and raw.endswith(suffix) and " " not in raw and "\n" not in raw and "\r" not in raw
    fixture_shape = (
        fixture
        and parts.scheme == "postgresql"
        and parts.hostname == "127.0.0.1"
        and parts.username == "fixture"
        and parts.path == "/postgres"
        and parts.port == 5432
    )
    if production_shape and fixture:
        print("ERROR: Fixture mode cannot be used with the production database URL.", file=sys.stderr)
        raise SystemExit(2)
    if not production_shape and not fixture_shape:
        fail()
    if parts.username is None or parts.password is None or parts.hostname is None:
        fail()

    password = urllib.parse.unquote(parts.password)
    user = urllib.parse.unquote(parts.username)
    if any(char in password or char in user for char in "\n\r\x00"):
        fail()

    out = Path(sys.argv[1])
    env_file = out / "pg.env"
    env_file.write_text(
        "".join(
            f"export {key}={shlex.quote(value)}\n"
            for key, value in (
                ("PGHOST", parts.hostname),
                ("PGPORT", str(parts.port or 5432)),
                ("PGUSER", user),
                ("PGPASSWORD", password),
                ("PGDATABASE", parts.path.lstrip("/")),
            )
        )
    )
    env_file.chmod(0o600)
    url_file = out / "db.url"
    url_file.write_text(raw)
    url_file.chmod(0o600)
except SystemExit:
    raise
except Exception:
    fail()
PY
unset SUPABASE_DB_URL

run_redacted() {
  local log="$cred/command.log"
  local status
  set +e
  "$@" >"$log" 2>&1
  status=$?
  set -e
  python3 - "$cred" "$log" << 'PY'
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

cred = Path(sys.argv[1])
text = Path(sys.argv[2]).read_text(errors="replace")
secrets = []
url_file = cred / "db.url"
if url_file.exists():
    raw = url_file.read_text()
    secrets.append(raw)
    parts = urlparse(raw)
    if parts.password:
        secrets.append(parts.password)
        secrets.append(unquote(parts.password))
for secret in secrets:
    if secret:
        text = text.replace(secret, "[redacted]")
sys.stdout.write(text)
if text and not text.endswith("\n"):
    sys.stdout.write("\n")
PY
  rm -f "$log"
  return "$status"
}

echo "Configuration shape validated."
echo "Checking previous verified backup marker..."

RPO_SECONDS=14400
DUPLICATE_GUARD_SECONDS=7200
CLI_VERSION=2.119.0

previous_last_modified="$(
  aws s3api list-objects-v2 \
    --bucket "$AWS_BACKUP_BUCKET" \
    --prefix "completed/" \
    --query 'sort_by(Contents,&LastModified)[-1].LastModified' \
    --output text
)"

previous_gap=false
age_seconds=0
if [[ -n "$previous_last_modified" && "$previous_last_modified" != "None" && "$previous_last_modified" != "null" ]]; then
  previous_epoch="$(date -d "$previous_last_modified" +%s)"
  now_epoch="$(date -u +%s)"
  age_seconds="$((now_epoch - previous_epoch))"

  if (( age_seconds > RPO_SECONDS )); then
    previous_gap=true
  fi

  if (( age_seconds < DUPLICATE_GUARD_SECONDS )); then
    echo "Latest verified backup is ${age_seconds}s old; duplicate guard is ${DUPLICATE_GUARD_SECONDS}s."
    echo "No full backup is required for this invocation."
    exit 0
  fi
fi

echo "Previous backup marker check completed."
echo "Checking production database connectivity and migration head..."

# shellcheck disable=SC1091
source "$cred/pg.env"
if ! remote_head="$(
  run_redacted docker run --rm \
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE \
    postgres:17-alpine \
    psql -v ON_ERROR_STOP=1 -Atqc "select version || '|' || name from supabase_migrations.schema_migrations order by version desc limit 1"
)"; then
  echo "ERROR: Could not connect to the production Supabase database using the configured Session Pooler secret."
  echo "Check the Secrets Manager value, percent-encoding of the password, and that the URL uses port 5432."
  exit 2
fi
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

remote_head="$(printf '%s' "$remote_head" | tr -d '\r' | head -n 1)"
if [[ ! "$remote_head" =~ ^[0-9]{14}\|[A-Za-z0-9_-]+$ ]]; then
  echo "ERROR: Migration head query returned an unexpected shape."
  exit 2
fi

echo "Production database connection succeeded."
remote_head_version="${remote_head%%|*}"
remote_head_name="${remote_head#*|}"
approved_version="${APPROVED_MIGRATION_HEAD%%_*}"

migration_aligned=false
if [[ "$remote_head_version" == "$approved_version" ]]; then
  migration_aligned=true
fi

echo "Installing the checksum-pinned Supabase CLI ${CLI_VERSION}..."
npm ci --ignore-scripts --omit=dev --prefix infra/aws/backup-cli
installed="$(node -p "require('./infra/aws/backup-cli/node_modules/supabase/package.json').version")"
if [[ "$installed" != "$CLI_VERSION" ]]; then
  echo "ERROR: Installed Supabase CLI does not match the approved version."
  exit 2
fi
cli="infra/aws/backup-cli/node_modules/@supabase/cli-linux-x64/bin/supabase"
if [[ ! -x "$cli" ]]; then
  echo "ERROR: Checksummed Supabase CLI linux-x64 binary is missing."
  exit 2
fi

backup_id="$(date -u +'%Y%m%dT%H%M%SZ')"
created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
mkdir -p backup-set

echo "Creating logical backup set..."
db_url="$(cat "$cred/db.url")"
# Supabase CLI 2.119.0 db dump requires --db-url. psql uses libpq env instead.
# Captured command output is redacted before it reaches the build log.
run_redacted "$cli" db dump --db-url "$db_url" -f backup-set/roles.sql --role-only
run_redacted "$cli" db dump --db-url "$db_url" -f backup-set/schema.sql
run_redacted "$cli" db dump --db-url "$db_url" -f backup-set/data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
run_redacted "$cli" db dump --db-url "$db_url" -f backup-set/history_schema.sql --schema supabase_migrations
run_redacted "$cli" db dump --db-url "$db_url" -f backup-set/history_data.sql --use-copy --data-only --schema supabase_migrations
unset db_url
rm -rf "$cred"
mkdir -p "$cred"

for file in roles.sql schema.sql data.sql history_schema.sql history_data.sql; do
  test -s "backup-set/$file"
done

jq -n \
  --arg backup_id "$backup_id" \
  --arg created_at "$created_at" \
  --arg source_project_ref "cxwwekdzkkjjbiyofrov" \
  --arg repository "NabarunDas/reputedefend-web" \
  --arg repository_sha "$head_sha" \
  --arg repo_migration_head "$APPROVED_MIGRATION_HEAD" \
  --arg database_migration_head "$remote_head_version|$remote_head_name" \
  --argjson migration_aligned "$migration_aligned" \
  --argjson previous_gap "$previous_gap" \
  --argjson previous_backup_age_seconds "$age_seconds" \
  --arg runner_script_sha256 "$script_sha" \
  --arg backup_cli_lock_sha256 "$lock_sha" \
  --arg cli_version "$CLI_VERSION" \
  '{
    backup_format: "profilerelaunch-logical-v1",
    runner: "aws-codebuild",
    scheduler: "amazon-eventbridge-scheduler",
    backup_id: $backup_id,
    created_at_utc: $created_at,
    source_project_ref: $source_project_ref,
    repository: $repository,
    repository_sha: $repository_sha,
    repo_migration_head: $repo_migration_head,
    database_migration_head: $database_migration_head,
    migration_aligned: $migration_aligned,
    previous_backup_gap_over_rpo: $previous_gap,
    previous_backup_age_seconds: $previous_backup_age_seconds,
    schedule_hours: 3,
    rpo_target_hours: 4,
    retention_days: 7,
    runner_script_sha256: $runner_script_sha256,
    backup_cli_lock_sha256: $backup_cli_lock_sha256,
    cli_version: $cli_version,
    files: [
      "roles.sql",
      "schema.sql",
      "data.sql",
      "history_schema.sql",
      "history_data.sql"
    ]
  }' > backup-set/manifest.json

archive="profilerelaunch-prod-db-${backup_id}.tar.gz"
tar -czf "$archive" -C backup-set \
  roles.sql schema.sql data.sql history_schema.sql history_data.sql manifest.json
sha256sum "$archive" | awk '{print $1}' > "${archive}.sha256"

key_prefix="backups/$(date -u +'%Y/%m/%d')/${backup_id}"

aws s3 cp "$archive" \
  "s3://$AWS_BACKUP_BUCKET/$key_prefix/$archive" \
  --sse AES256 --only-show-errors
aws s3 cp "${archive}.sha256" \
  "s3://$AWS_BACKUP_BUCKET/$key_prefix/${archive}.sha256" \
  --sse AES256 --content-type text/plain --only-show-errors
aws s3 cp backup-set/manifest.json \
  "s3://$AWS_BACKUP_BUCKET/$key_prefix/manifest.json" \
  --sse AES256 --content-type application/json --only-show-errors

aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/$archive" >/dev/null
aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/${archive}.sha256" >/dev/null
aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/manifest.json" >/dev/null

aws s3 cp backup-set/manifest.json \
  "s3://$AWS_BACKUP_BUCKET/completed/${backup_id}.json" \
  --sse AES256 --content-type application/json --only-show-errors

echo "Backup ID: $backup_id"
echo "Migration head aligned: $migration_aligned"
echo "Previous verified backup age (seconds): $age_seconds"
echo "Previous backup gap >4h: $previous_gap"

if [[ "$migration_aligned" != "true" || "$previous_gap" == "true" ]]; then
  echo "Backup was uploaded and verified, but the recovery policy check failed."
  echo "Investigate migration-head drift or a previous >4h backup gap."
  exit 1
fi
