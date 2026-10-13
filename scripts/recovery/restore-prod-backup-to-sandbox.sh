#!/usr/bin/env bash
# SEC-01: Restore a reviewed production logical backup into the dedicated,
# empty ProfileRelaunch-Restore Supabase project. Never use for PROD or DEV.
# Usage: bash scripts/recovery/restore-prod-backup-to-sandbox.sh YYYYMMDDTHHMMSSZ
set -euo pipefail
set +x
umask 077
export AWS_PAGER=""

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "STOP: Supply one UTC backup ID (YYYYMMDDTHHMMSSZ)" >&2
  exit 2
fi

REGION="eu-west-2"
ACCOUNT="337909767363"
BUCKET="profilerelaunch-prod-db-backups-euw2-20261005"
SOURCE_REF="cxwwekdzkkjjbiyofrov"
RESTORE_REF="mguynvowyhupycznwbyd"
ID="$1"
BACKUP_DAY="$(printf '%s' "$ID" | cut -c1-4)/$(printf '%s' "$ID" | cut -c5-6)/$(printf '%s' "$ID" | cut -c7-8)"
PREFIX="backups/$BACKUP_DAY/$ID"
ARCHIVE="profilerelaunch-prod-db-$ID.tar.gz"

for tool in aws jq tar sha256sum python3 psql; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "STOP: Missing prerequisite: $tool" >&2
    exit 2
  }
done

TMP="$(mktemp -d)"
LOG="$(mktemp "$HOME/sec01-restore-$ID-XXXXXX.log")"
START="$(date +%s)"
cleanup() {
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE PGCONNECT_TIMEOUT || true
  rm -rf -- "$TMP"
}
trap cleanup EXIT

echo "=== 1. Verify AWS account and PostgreSQL client ==="
test "$(aws sts get-caller-identity --query Account --output text)" = "$ACCOUNT" || {
  echo "STOP: Wrong AWS account" >&2
  exit 2
}
psql --version | grep -Eq '^psql \(PostgreSQL\) 17\.' || {
  echo "STOP: PostgreSQL client 17 required" >&2
  exit 2
}
echo "PASS: Account and PostgreSQL 17 verified"

echo "=== 2. Download original backup from private S3 ==="
aws s3 cp "s3://$BUCKET/$PREFIX/$ARCHIVE" "$TMP/$ARCHIVE" \
  --region "$REGION" --only-show-errors
aws s3 cp "s3://$BUCKET/$PREFIX/$ARCHIVE.sha256" "$TMP/expected.sha256" \
  --region "$REGION" --only-show-errors
aws s3 cp "s3://$BUCKET/$PREFIX/manifest.json" "$TMP/manifest.json" \
  --region "$REGION" --only-show-errors
aws s3 cp "s3://$BUCKET/completed/$ID.json" "$TMP/completed.json" \
  --region "$REGION" --only-show-errors

echo "=== 3. Verify archive integrity and Production origin ==="
EXPECTED="$(tr -d '[:space:]' < "$TMP/expected.sha256")"
ACTUAL="$(sha256sum "$TMP/$ARCHIVE" | awk '{print $1}')"
if [[ ! "$EXPECTED" =~ ^[0-9a-f]{64}$ || "$ACTUAL" != "$EXPECTED" ]]; then
  echo "STOP: Archive SHA-256 mismatch" >&2
  exit 2
fi
cmp -s "$TMP/manifest.json" "$TMP/completed.json" || {
  echo "STOP: Completion marker differs from manifest" >&2
  exit 2
}
jq -e --arg id "$ID" --arg source "$SOURCE_REF" '
  .backup_format == "profilerelaunch-logical-v1" and
  .backup_id == $id and
  .source_project_ref == $source and
  .migration_aligned == true and
  .previous_backup_gap_over_rpo == false and
  (.database_migration_head | type == "string" and
    test("^[0-9]{14}[|][A-Za-z0-9_-]+$"))
' "$TMP/manifest.json" >/dev/null || {
  echo "STOP: Unexpected manifest, migration drift or RPO gap" >&2
  exit 2
}
EXPECTED_HEAD="$(jq -r '.database_migration_head' "$TMP/manifest.json")"

printf '%s\n' roles.sql schema.sql data.sql history_schema.sql \
  history_data.sql manifest.json | sort > "$TMP/expected-files"
tar -tzf "$TMP/$ARCHIVE" | sort > "$TMP/actual-files"
diff -q "$TMP/expected-files" "$TMP/actual-files" || {
  echo "STOP: Archive member list mismatch" >&2
  exit 2
}
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
cmp -s "$TMP/manifest.json" "$TMP/completed.json" || {
  echo "STOP: Manifest inside archive differs from completed marker" >&2
  exit 2
}
for file in roles.sql schema.sql data.sql history_schema.sql history_data.sql; do
  test -s "$TMP/$file" || {
    echo "STOP: Missing or empty $file" >&2
    exit 2
  }
done
echo "PASS: SHA-256, six archive members, manifest and source verified"

echo "=== 4. Apply reviewed managed-role workaround in temporary copy ==="
python3 - "$TMP/roles.sql" "$TMP/roles-restore.sql" <<'PY'
from pathlib import Path
import re
import sys

lines = Path(sys.argv[1]).read_text().splitlines(keepends=True)
if len(lines) != 15:
    raise SystemExit("STOP: roles.sql changed; review before adapting workaround")

statement = lines[12].strip()
pattern = (
    r'GRANT\s+SET\s+ON\s+PARAMETER\s+'
    r'"log_min_messages"\s+TO\s+[^;\r\n]+;'
)
if not re.fullmatch(pattern, statement, re.IGNORECASE):
    raise SystemExit("STOP: Expected quoted log_min_messages grant not found")
if sum("log_min_messages" in line.lower() for line in lines) != 1:
    raise SystemExit("STOP: Unexpected extra logging-parameter references")

lines[12] = "-- Omitted unsupported Supabase-managed logging-parameter grant\n"
Path(sys.argv[2]).write_text("".join(lines))
print("PASS: One unsupported GRANT SET omitted; all other lines preserved")
PY

echo "=== 5. Connect only to the dedicated disposable Restore project ==="
echo "Approved destination: ProfileRelaunch-Restore ($RESTORE_REF), eu-west-1"
echo "Enter the Session pooler hostname from THAT project's Supabase Connect panel."
IFS= read -r -p "Restore pooler hostname: " RESTORE_HOST < /dev/tty
if [[ ! "$RESTORE_HOST" =~ ^aws-[0-9]+-eu-west-1\.pooler\.supabase\.com$ ]]; then
  echo "STOP: Unexpected pooler hostname" >&2
  exit 2
fi
export PGHOST="$RESTORE_HOST"
export PGPORT="5432"
export PGUSER="postgres.$RESTORE_REF"
export PGDATABASE="postgres"
export PGSSLMODE="require"
export PGCONNECT_TIMEOUT="15"
IFS= read -r -s -p "Restore DB password (hidden): " PGPASSWORD < /dev/tty
printf '\n' > /dev/tty
export PGPASSWORD
if [[ -z "$PGPASSWORD" ]]; then
  echo "STOP: Empty restore password" >&2
  exit 2
fi

echo "=== 6. Fail closed unless the destination is empty ==="
CHECK="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  SELECT current_database() || '|' ||
    (current_setting('server_version_num')::integer / 10000)::text || '|' ||
    (SELECT count(*) FROM pg_catalog.pg_tables
     WHERE schemaname='public')::text || '|' ||
    (SELECT count(*) FROM auth.users)::text || '|' ||
    (SELECT count(*) FROM storage.objects)::text || '|' ||
    (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text;
" 2>/dev/null)" || {
  echo "STOP: Connection or destination preflight failed" >&2
  exit 2
}
if [[ "$CHECK" != "postgres|17|0|0|0|false" ]]; then
  echo "STOP: Target is not empty. Never overwrite a previously restored copy." >&2
  exit 2
fi
echo "PASS: Empty, dedicated PostgreSQL 17 recovery target"

echo "This operation writes ONLY to project $RESTORE_REF and may restore personal data."
IFS= read -r -p "Type RESTORE $RESTORE_REF to proceed: " CONFIRM < /dev/tty
if [[ "$CONFIRM" != "RESTORE $RESTORE_REF" ]]; then
  echo "STOP: Operator did not confirm the destination" >&2
  exit 2
fi

echo "=== 7. Restore roles, schema and data in one transaction ==="
if ! psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  --file "$TMP/roles-restore.sql" \
  --file "$TMP/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$TMP/data.sql" > "$LOG" 2>&1; then
  echo "FAIL: Main restore transaction failed. Do NOT blindly retry." >&2
  echo "Inspect the private CloudShell log (may contain sensitive SQL)." >&2
  exit 1
fi
echo "PASS: Main restore completed"

echo "=== 8. Restore migration history in a separate transaction ==="
if ! psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  --file "$TMP/history_schema.sql" \
  --file "$TMP/history_data.sql" >> "$LOG" 2>&1; then
  echo "FAIL: Migration-history restore failed; main restore may be committed." >&2
  echo "Do NOT retry until the recovery target has been inspected." >&2
  exit 1
fi
echo "PASS: Migration history restored"

echo "=== 9. Verify restored migration head and counts ==="
RESTORED_HEAD="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  SELECT version || '|' || name
  FROM supabase_migrations.schema_migrations
  ORDER BY version DESC LIMIT 1;
")"
if [[ "$RESTORED_HEAD" != "$EXPECTED_HEAD" ]]; then
  echo "FAIL: Restored migration head differs from manifest" >&2
  exit 1
fi
echo "PASS: Migration head matched"
psql -X -qAt -v ON_ERROR_STOP=1 -F ' | ' -c "
  SELECT 'Public tables', count(*)::text FROM pg_catalog.pg_tables
    WHERE schemaname='public'
  UNION ALL SELECT 'Public tables with RLS', count(*)::text
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
      ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  UNION ALL SELECT 'Auth users', count(*)::text FROM auth.users
  UNION ALL SELECT 'Storage metadata', count(*)::text FROM storage.objects
  UNION ALL SELECT 'Migration records', count(*)::text
    FROM supabase_migrations.schema_migrations;
"

echo "Restore script elapsed seconds: $(($(date +%s) - START))"
echo "SUCCESS: SEC-01 isolated logical database restore completed"
echo "Backup ID: $ID; target ref: $RESTORE_REF; SQL workaround: one grant omitted"
echo "Original S3 archive unchanged; DEV and PROD were not restore destinations"
echo "Temporary SQL files are removed on exit"
