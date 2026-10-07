#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Missing SUPABASE_DB_URL}"
: "${AWS_BACKUP_BUCKET:?Missing AWS_BACKUP_BUCKET}"
: "${AWS_REGION:?Missing AWS_REGION}"

RPO_SECONDS=14400
DUPLICATE_GUARD_SECONDS=7200
CLI_VERSION=2.119.0

previous_last_modified="$(
  aws s3api list-objects-v2     --bucket "$AWS_BACKUP_BUCKET"     --prefix "completed/"     --query 'sort_by(Contents,&LastModified)[-1].LastModified'     --output text
)"

previous_gap=false
age_seconds=0
has_previous=false
if [[ -n "$previous_last_modified" && "$previous_last_modified" != "None" ]]; then
  has_previous=true
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

backup_id="$(date -u +'%Y%m%dT%H%M%SZ')"
created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
repository_sha="$(git rev-parse HEAD)"
repo_head_file="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort | tail -n 1)"
repo_head_name="$(basename "$repo_head_file" .sql)"
repo_head_version="${repo_head_name%%_*}"

remote_head="$(
  docker run --rm postgres:17-alpine     psql "$SUPABASE_DB_URL" -Atqc     "select version || '|' || name from supabase_migrations.schema_migrations order by version desc limit 1"
)"
remote_head_version="${remote_head%%|*}"
remote_head_name="${remote_head#*|}"

migration_aligned=false
if [[ "$remote_head_version" == "$repo_head_version" ]]; then
  migration_aligned=true
fi

umask 077
mkdir -p backup-set

npx --yes "supabase@${CLI_VERSION}" db dump --db-url "$SUPABASE_DB_URL" -f backup-set/roles.sql --role-only
npx --yes "supabase@${CLI_VERSION}" db dump --db-url "$SUPABASE_DB_URL" -f backup-set/schema.sql
npx --yes "supabase@${CLI_VERSION}" db dump --db-url "$SUPABASE_DB_URL" -f backup-set/data.sql   --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
npx --yes "supabase@${CLI_VERSION}" db dump --db-url "$SUPABASE_DB_URL"   -f backup-set/history_schema.sql --schema supabase_migrations
npx --yes "supabase@${CLI_VERSION}" db dump --db-url "$SUPABASE_DB_URL"   -f backup-set/history_data.sql --use-copy --data-only --schema supabase_migrations

for file in roles.sql schema.sql data.sql history_schema.sql history_data.sql; do
  test -s "backup-set/$file"
done

jq -n   --arg backup_id "$backup_id"   --arg created_at "$created_at"   --arg source_project_ref "cxwwekdzkkjjbiyofrov"   --arg repository "NabarunDas/reputedefend-web"   --arg repository_sha "$repository_sha"   --arg repo_migration_head "$repo_head_name"   --arg database_migration_head "$remote_head_version|$remote_head_name"   --argjson migration_aligned "$migration_aligned"   --argjson previous_gap "$previous_gap"   --argjson previous_backup_age_seconds "$age_seconds"   '{
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
    files: [
      "roles.sql",
      "schema.sql",
      "data.sql",
      "history_schema.sql",
      "history_data.sql"
    ]
  }' > backup-set/manifest.json

archive="profilerelaunch-prod-db-${backup_id}.tar.gz"
tar -czf "$archive" -C backup-set   roles.sql schema.sql data.sql history_schema.sql history_data.sql manifest.json
sha256sum "$archive" | awk '{print $1}' > "${archive}.sha256"

key_prefix="backups/$(date -u +'%Y/%m/%d')/${backup_id}"

aws s3 cp "$archive"   "s3://$AWS_BACKUP_BUCKET/$key_prefix/$archive"   --sse AES256 --only-show-errors
aws s3 cp "${archive}.sha256"   "s3://$AWS_BACKUP_BUCKET/$key_prefix/${archive}.sha256"   --sse AES256 --content-type text/plain --only-show-errors
aws s3 cp backup-set/manifest.json   "s3://$AWS_BACKUP_BUCKET/$key_prefix/manifest.json"   --sse AES256 --content-type application/json --only-show-errors

aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/$archive" >/dev/null
aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/${archive}.sha256" >/dev/null
aws s3api head-object --bucket "$AWS_BACKUP_BUCKET" --key "$key_prefix/manifest.json" >/dev/null

aws s3 cp backup-set/manifest.json   "s3://$AWS_BACKUP_BUCKET/completed/${backup_id}.json"   --sse AES256 --content-type application/json --only-show-errors

echo "Backup ID: $backup_id"
echo "Migration head aligned: $migration_aligned"
echo "Previous verified backup age (seconds): $age_seconds"
echo "Previous backup gap >4h: $previous_gap"

if [[ "$migration_aligned" != "true" || "$previous_gap" == "true" ]]; then
  echo "Backup was uploaded and verified, but the recovery policy check failed."
  echo "Investigate migration-head drift or a previous >4h backup gap."
  exit 1
fi
