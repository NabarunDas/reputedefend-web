import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = path.resolve(new URL("../../../..", import.meta.url).pathname)
const runnerPath = path.join(repoRoot, "scripts/prod-db-backup-aws.sh")
const verifierPath = path.join(repoRoot, "scripts/prod-db-backup-verify-source.sh")
const lockPath = path.join(repoRoot, "infra/aws/backup-cli/package-lock.json")
const packagePath = path.join(repoRoot, "infra/aws/backup-cli/package.json")
const stackPath = path.join(repoRoot, "infra/aws/prod-db-backup-aws-native.yaml")
const awsDocPath = path.join(repoRoot, "docs/admin/aws-native-production-database-backups.md")
const backupDocPath = path.join(repoRoot, "docs/admin/production-database-backups.md")

const runner = readFileSync(runnerPath)
const verifier = readFileSync(verifierPath, "utf8")
const lockFile = readFileSync(lockPath)
const stack = readFileSync(stackPath, "utf8")
const runnerSha = createHash("sha256").update(runner).digest("hex")
const lockSha = createHash("sha256").update(lockFile).digest("hex")

const FIXTURE_URL = "postgresql://fixture:fix%2Fsecret-do-not-log@127.0.0.1:5432/postgres"
const FIXTURE_SECRET = "fix/secret-do-not-log"
const ENCODED_SECRET = "fix%2Fsecret-do-not-log"
const APPROVED_HEAD = "20261004223358_data_api_default_privileges_hardening_v1"
const REMOTE_HEAD = "20261004223358|data_api_default_privileges_hardening_v1"

function git(cwd: string, args: string[]) {
  const result = spawnSync(
    "git",
    [
      "-c", "user.email=backup-test@example.com",
      "-c", "user.name=Backup Test",
      "-c", "commit.gpgsign=false",
      "-c", "core.fsmonitor=false",
      ...args,
    ],
    { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`)
  }
  return result.stdout.trim()
}

function writeExecutable(file: string, body: string) {
  writeFileSync(file, body, { mode: 0o755 })
}

function isoSecondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function createOrigin() {
  const root = mkdtempSync(path.join(tmpdir(), "pr-backup-origin-"))
  const origin = path.join(root, "origin")
  mkdirSync(origin)
  mkdirSync(path.join(origin, "scripts"), { recursive: true })
  mkdirSync(path.join(origin, "infra/aws/backup-cli"), { recursive: true })
  writeFileSync(path.join(origin, "scripts/prod-db-backup-aws.sh"), runner)
  writeFileSync(path.join(origin, "infra/aws/backup-cli/package-lock.json"), lockFile)
  writeFileSync(path.join(origin, "infra/aws/backup-cli/package.json"), readFileSync(packagePath))
  git(origin, ["init", "--quiet"])
  git(origin, ["add", "."])
  git(origin, ["commit", "--quiet", "-m", "approved runner"])
  const approved = git(origin, ["rev-parse", "HEAD"])
  writeFileSync(
    path.join(origin, "scripts/prod-db-backup-aws.sh"),
    Buffer.concat([runner, Buffer.from("\n# mutated on main\n")]),
  )
  git(origin, ["add", "."])
  git(origin, ["commit", "--quiet", "-m", "mutate main"])
  const mainTip = git(origin, ["rev-parse", "HEAD"])
  return { root, origin, approved, mainTip }
}

function verifierEnv(origin: string, checkout: string, overrides: Record<string, string> = {}) {
  return {
    ...process.env,
    APPROVED_RUNNER_COMMIT: overrides.APPROVED_RUNNER_COMMIT ?? "",
    APPROVED_RUNNER_SCRIPT_SHA256: overrides.APPROVED_RUNNER_SCRIPT_SHA256 ?? runnerSha,
    APPROVED_BACKUP_CLI_LOCK_SHA256: overrides.APPROVED_BACKUP_CLI_LOCK_SHA256 ?? lockSha,
    REPOSITORY_CLONE_URL: origin,
    CHECKOUT_DIR: checkout,
    GIT_TERMINAL_PROMPT: "0",
  }
}

function runVerifier(cwd: string, env: NodeJS.ProcessEnv) {
  return spawnSync("bash", [verifierPath], { cwd, env, encoding: "utf8" })
}

type RunnerResult = {
  status: number | null
  stdout: string
  stderr: string
  root: string
  repo: string
  output: string
}

function createRunnerFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "pr-backup-run-"))
  const repo = path.join(root, "repo")
  const bin = path.join(root, "bin")
  const awsRoot = path.join(root, "aws")
  mkdirSync(path.join(repo, "scripts"), { recursive: true })
  mkdirSync(path.join(repo, "infra/aws/backup-cli"), { recursive: true })
  mkdirSync(bin)
  mkdirSync(awsRoot)
  writeFileSync(path.join(repo, "scripts/prod-db-backup-aws.sh"), runner)
  writeFileSync(path.join(repo, "infra/aws/backup-cli/package-lock.json"), lockFile)
  writeFileSync(path.join(repo, "infra/aws/backup-cli/package.json"), readFileSync(packagePath))
  git(repo, ["init", "--quiet"])
  git(repo, ["add", "."])
  git(repo, ["commit", "--quiet", "-m", "approved runner"])
  const sha = git(repo, ["rev-parse", "HEAD"])
  writeExecutable(
    path.join(bin, "aws"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_AWS_LOG"
cmd="$1"
shift
if [[ "$cmd" == "s3api" && "$1" == "list-objects-v2" ]]; then
  if [[ -f "$FAKE_AWS_ROOT/list-result.txt" ]]; then
    cat "$FAKE_AWS_ROOT/list-result.txt"
  else
    printf 'None\\n'
  fi
  exit 0
fi
if [[ "$cmd" == "s3api" && "$1" == "head-object" ]]; then
  bucket=""
  key=""
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --bucket) bucket="$2"; shift 2 ;;
      --key) key="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [[ ! -f "$FAKE_AWS_ROOT/s3/$bucket/$key" ]]; then
    echo "missing object" >&2
    exit 1
  fi
  exit 0
fi
if [[ "$cmd" == "s3" && "$1" == "cp" ]]; then
  src="$2"
  dest="$3"
  rest="\${dest#s3://}"
  bucket="\${rest%%/*}"
  key="\${rest#*/}"
  key_dir="\$(dirname "\$key")"
  mkdir -p "\$FAKE_AWS_ROOT/s3/\$bucket/\$key_dir"
  cp "\$src" "\$FAKE_AWS_ROOT/s3/\$bucket/\$key"
  exit 0
fi
echo "unexpected aws invocation" >&2
exit 1
`,
  )
  writeExecutable(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "\$*" == *"${FIXTURE_SECRET}"* || "\$*" == *"${ENCODED_SECRET}"* || "\$*" == *"postgresql://"* ]]; then
  echo "secret in docker argv" >> "$FAKE_DOCKER_LOG"
fi
if [[ "\${FAKE_DOCKER_FAIL:-}" == "1" ]]; then
  echo "password=\${PGPASSWORD:-}" >&2
  echo "connection refused" >&2
  exit 1
fi
printf '%s\\n' "\${FAKE_REMOTE_HEAD}"
`,
  )
  writeExecutable(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_NPM_LOG"
prefix="."
prev=""
for arg in "$@"; do
  if [[ "$prev" == "--prefix" ]]; then
    prefix="$arg"
  fi
  prev="$arg"
done
mkdir -p "$prefix/node_modules/supabase"
printf '%s\\n' "{\\"version\\":\\"\${FAKE_NPM_VERSION:-2.119.0}\\"}" > "$prefix/node_modules/supabase/package.json"
if [[ "\${FAKE_NPM_SKIP_BIN:-}" == "1" ]]; then
  exit 0
fi
bindir="$prefix/node_modules/@supabase/cli-linux-x64/bin"
mkdir -p "$bindir"
cat > "$bindir/supabase" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${FAKE_SUPABASE_LOG:?}"
echo "cli-saw $*"
if [[ -n "\${FAKE_SUPABASE_EXTRA:-}" ]]; then
  echo "\${FAKE_SUPABASE_EXTRA}"
fi
out=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-f" ]]; then
    out="$arg"
  fi
  prev="$arg"
done
if [[ -n "$out" ]]; then
  printf 'fixture dump\\n' > "$out"
fi
EOF
chmod +x "$bindir/supabase"
`,
  )
  return { root, repo, sha, bin, awsRoot }
}

function runRunner(
  fixture: ReturnType<typeof createRunnerFixture>,
  overrides: Record<string, string | undefined> = {},
  options?: { remoteHead?: string; npmVersion?: string; skipBinary?: boolean; dockerFail?: boolean; extraCliLine?: string },
): RunnerResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${fixture.bin}:${process.env.PATH}`,
    AWS_BACKUP_BUCKET: "fixture-backup-bucket",
    AWS_REGION: "eu-west-2",
    APPROVED_MIGRATION_HEAD: APPROVED_HEAD,
    APPROVED_RUNNER_COMMIT: fixture.sha,
    APPROVED_RUNNER_SCRIPT_SHA256: runnerSha,
    APPROVED_BACKUP_CLI_LOCK_SHA256: lockSha,
    BACKUP_RUNNER_ALLOW_FIXTURE: "1",
    SUPABASE_DB_URL: FIXTURE_URL,
    FAKE_AWS_ROOT: fixture.awsRoot,
    FAKE_AWS_LOG: path.join(fixture.root, "aws.log"),
    FAKE_DOCKER_LOG: path.join(fixture.root, "docker.log"),
    FAKE_NPM_LOG: path.join(fixture.root, "npm.log"),
    FAKE_SUPABASE_LOG: path.join(fixture.root, "supabase.log"),
    FAKE_REMOTE_HEAD: options?.remoteHead ?? REMOTE_HEAD,
    FAKE_NPM_VERSION: options?.npmVersion ?? "2.119.0",
    FAKE_NPM_SKIP_BIN: options?.skipBinary ? "1" : "",
    FAKE_DOCKER_FAIL: options?.dockerFail ? "1" : "",
    FAKE_SUPABASE_EXTRA: options?.extraCliLine ?? FIXTURE_SECRET,
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  const result = spawnSync("bash", ["scripts/prod-db-backup-aws.sh"], {
    cwd: fixture.repo,
    env,
    encoding: "utf8",
    timeout: 8000,
  })
  if (result.error) {
    throw new Error(`${result.error.message}\n${result.stdout}\n${result.stderr}`)
  }
  const stdout = result.stdout ?? ""
  const stderr = result.stderr ?? ""
  return {
    status: result.status,
    stdout,
    stderr,
    root: fixture.root,
    repo: fixture.repo,
    output: `${stdout}\n${stderr}`,
  }
}

function assertNoSecret(text: string) {
  expect(text).not.toContain(FIXTURE_SECRET)
  expect(text).not.toContain(ENCODED_SECRET)
  expect(text).not.toContain(FIXTURE_URL)
  expect(text).not.toContain("postgresql://")
}

function uploadedFiles(root: string) {
  const bucket = path.join(root, "aws/s3/fixture-backup-bucket")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(full)
    }
  }
  if (existsSync(bucket)) walk(bucket)
  return files
}

describe("approved backup runner source", () => {
  it("checks out the approved commit when main has moved", () => {
    const origin = createOrigin()
    const work = mkdtempSync(path.join(tmpdir(), "pr-backup-work-"))
    const result = runVerifier(
      work,
      verifierEnv(origin.origin, "checkout", { APPROVED_RUNNER_COMMIT: origin.approved }),
    )
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(work, "checkout/scripts/prod-db-backup-aws.sh"))).toEqual(runner)
    expect(git(path.join(work, "checkout"), ["rev-parse", "HEAD"])).toBe(origin.approved)
    expect(origin.mainTip).not.toBe(origin.approved)
    rmSync(origin.root, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  })

  it("fails closed when the commit or checksum does not match", () => {
    const origin = createOrigin()
    const work = mkdtempSync(path.join(tmpdir(), "pr-backup-work-"))
    const wrongHash = runVerifier(
      work,
      verifierEnv(origin.origin, "checkout", {
        APPROVED_RUNNER_COMMIT: origin.approved,
        APPROVED_RUNNER_SCRIPT_SHA256: "a".repeat(64),
      }),
    )
    expect(wrongHash.status).toBe(2)
    expect(wrongHash.stdout + wrongHash.stderr).toContain("Checksum mismatch")
    expect(existsSync(path.join(work, "checkout"))).toBe(false)

    const wrongCommit = runVerifier(
      work,
      verifierEnv(origin.origin, "checkout", { APPROVED_RUNNER_COMMIT: "b".repeat(40) }),
    )
    expect(wrongCommit.status).toBe(2)
    expect(existsSync(path.join(work, "checkout"))).toBe(false)

    const movedTip = runVerifier(
      work,
      verifierEnv(origin.origin, "checkout", {
        APPROVED_RUNNER_COMMIT: origin.mainTip,
        APPROVED_RUNNER_SCRIPT_SHA256: runnerSha,
      }),
    )
    expect(movedTip.status).toBe(2)
    expect(existsSync(path.join(work, "checkout"))).toBe(false)
    rmSync(origin.root, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  })

  it("does not fall back to HEAD or main", () => {
    expect(verifier).not.toContain("git clone")
    expect(verifier).not.toContain("--branch")
    expect(verifier).not.toMatch(/git\s+checkout\s+(main|master|HEAD|head)\b/)
    expect(stack).not.toContain("git clone")
    expect(stack).not.toContain("--branch")

    const origin = createOrigin()
    const work = mkdtempSync(path.join(tmpdir(), "pr-backup-work-"))
    for (const ref of ["main", "HEAD", "head", "master"]) {
      const result = runVerifier(work, verifierEnv(origin.origin, "checkout", { APPROVED_RUNNER_COMMIT: ref }))
      expect(result.status).toBe(2)
      expect(result.stdout + result.stderr).not.toContain("Approved runner commit verified.")
    }
    expect(git(origin.origin, ["rev-parse", "HEAD"])).toBe(origin.mainTip)
    rmSync(origin.root, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  })

  it("embeds the verifier in the buildspec and pins the reviewed checksums", () => {
    const encoded = stack.match(/base64\.b64decode\('([^']+)'\)/)
    expect(encoded).not.toBeNull()
    expect(Buffer.from(encoded![1], "base64")).toEqual(readFileSync(verifierPath))
    expect(stack).toContain(`Default: "${runnerSha}"`)
    expect(stack).toContain(`Default: "${lockSha}"`)
    expect(stack).toContain(`Default: "${APPROVED_HEAD}"`)
    expect(stack.indexOf("prod-db-backup-verify-source.sh")).toBeLessThan(
      stack.indexOf("cd repo && bash scripts/prod-db-backup-aws.sh"),
    )
    const commitBlock = stack.slice(stack.indexOf("ApprovedRunnerCommit:"), stack.indexOf("ApprovedRunnerScriptSha256:"))
    expect(commitBlock).not.toContain("Default:")
  })
})

describe("production backup runner behaviour", () => {
  function fixture() {
    return createRunnerFixture()
  }

  it("creates the logical backup set, uploads it, and verifies the checksum", () => {
    const created = fixture()
    const result = runRunner(created, {}, { extraCliLine: FIXTURE_SECRET })
    expect(result.status).toBe(0)
    assertNoSecret(result.output)
    const files = uploadedFiles(created.root)
    const archive = files.find((file) => file.endsWith(".tar.gz"))
    const checksum = files.find((file) => file.endsWith(".tar.gz.sha256"))
    const manifest = files.find((file) => file.endsWith("/manifest.json") && !file.includes("/completed/"))
    const marker = files.find((file) => file.includes("/completed/") && file.endsWith(".json"))
    expect(archive).toBeTruthy()
    expect(checksum).toBeTruthy()
    expect(manifest).toBeTruthy()
    expect(marker).toBeTruthy()
    const recorded = readFileSync(checksum!, "utf8").trim()
    expect(recorded).toMatch(/^[0-9a-f]{64}$/)
    expect(recorded).toBe(createHash("sha256").update(readFileSync(archive!)).digest("hex"))
    const listing = spawnSync("tar", ["-tzf", archive!], { encoding: "utf8" })
    expect(listing.stdout.split("\n").filter(Boolean).sort()).toEqual([
      "data.sql",
      "history_data.sql",
      "history_schema.sql",
      "manifest.json",
      "roles.sql",
      "schema.sql",
    ])
    const manifestJson = JSON.parse(readFileSync(manifest!, "utf8"))
    expect(manifestJson).toMatchObject({
      backup_format: "profilerelaunch-logical-v1",
      runner: "aws-codebuild",
      scheduler: "amazon-eventbridge-scheduler",
      source_project_ref: "cxwwekdzkkjjbiyofrov",
      repository: "NabarunDas/reputedefend-web",
      repository_sha: created.sha,
      repo_migration_head: APPROVED_HEAD,
      database_migration_head: REMOTE_HEAD,
      migration_aligned: true,
      previous_backup_gap_over_rpo: false,
      schedule_hours: 3,
      rpo_target_hours: 4,
      retention_days: 7,
      runner_script_sha256: runnerSha,
      backup_cli_lock_sha256: lockSha,
      cli_version: "2.119.0",
      files: ["roles.sql", "schema.sql", "data.sql", "history_schema.sql", "history_data.sql"],
    })
    expect(readFileSync(marker!, "utf8")).toBe(readFileSync(manifest!, "utf8"))
    for (const file of files) assertNoSecret(readFileSync(file, "utf8"))
    expect(readFileSync(path.join(created.root, "docker.log"), "utf8")).not.toContain("secret in docker argv")
    expect(readFileSync(path.join(created.root, "docker.log"), "utf8")).toContain("-e PGPASSWORD")
    expect(readFileSync(path.join(created.root, "npm.log"), "utf8")).toContain("ci --ignore-scripts --omit=dev")
    expect(readFileSync(path.join(created.root, "supabase.log"), "utf8")).toContain("--db-url")
    expect(result.stdout).toContain("[redacted]")
    rmSync(created.root, { recursive: true, force: true })
  })

  it("handles Docker pull chatter before the SQL migration head but refuses ambiguous output", () => {
    const firstPull = fixture()
    const chatter = ["Unable to find image 'postgres:17-alpine' locally",
      "17-alpine: Pulling from library/postgres",
      "Status: Downloaded newer image for postgres:17-alpine", REMOTE_HEAD].join("\n")
    const accepted = runRunner(firstPull, {}, { remoteHead: chatter, extraCliLine: "" })
    expect(accepted.status).toBe(0)
    assertNoSecret(accepted.output)
    const marker = uploadedFiles(firstPull.root).find((file) => file.includes("/completed/"))
    expect(marker).toBeTruthy()
    expect(JSON.parse(readFileSync(marker!, "utf8")).database_migration_head).toBe(REMOTE_HEAD)

    const ambiguous = fixture()
    const refused = runRunner(ambiguous, {}, { remoteHead: [REMOTE_HEAD, REMOTE_HEAD].join("\n"), extraCliLine: "" })
    expect(refused.status).toBe(2)
    expect(refused.output).toContain("Migration head query returned an unexpected shape")
    expect(uploadedFiles(ambiguous.root)).toEqual([])

    const noRow = fixture()
    const absent = runRunner(noRow, {}, { remoteHead: "Status: Downloaded newer image", extraCliLine: "" })
    expect(absent.status).toBe(2)
    expect(uploadedFiles(noRow.root)).toEqual([])
    for (const created of [firstPull, ambiguous, noRow]) rmSync(created.root, { recursive: true, force: true })
  })

  it("keeps secrets out of logs when the credential is missing, invalid, or rejected", () => {
    const missing = fixture()
    const missingResult = runRunner(missing, { SUPABASE_DB_URL: undefined })
    expect(missingResult.status).not.toBe(0)
    expect(missingResult.output).toContain("Missing SUPABASE_DB_URL")
    expect(existsSync(path.join(missing.root, "docker.log"))).toBe(false)

    const invalid = fixture()
    const invalidResult = runRunner(invalid, {
      SUPABASE_DB_URL: "postgresql://fixture:not-a-real-prod-password@example.com:5432/postgres",
    })
    expect(invalidResult.status).toBe(2)
    expect(invalidResult.output).not.toContain("not-a-real-prod-password")
    expect(invalidResult.output).not.toContain("example.com")
    expect(existsSync(path.join(invalid.root, "docker.log"))).toBe(false)

    const productionShaped = fixture()
    const productionUrl =
      "postgresql://postgres.cxwwekdzkkjjbiyofrov:not-a-real-prod-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
    const productionResult = runRunner(productionShaped, { SUPABASE_DB_URL: productionUrl })
    expect(productionResult.status).toBe(2)
    expect(productionResult.output).toContain("Fixture mode cannot be used")
    expect(productionResult.output).not.toContain("not-a-real-prod-password")

    const escaped = fixture()
    const escapedResult = runRunner(
      escaped,
      { SUPABASE_DB_URL: "postgresql://fixture:a%22b%5Cc@127.0.0.1:5432/postgres" },
      { extraCliLine: 'export PGPASSWORD="a\\"b\\\\c"' },
    )
    expect(escapedResult.status).toBe(0)
    expect(escapedResult.output).not.toContain('a\\"b\\\\c')
    expect(escapedResult.output).not.toContain('a"b\\c')
    expect(escapedResult.output).toContain("PGPASSWORD=[redacted]")

    const refused = fixture()
    const refusedResult = runRunner(refused, {}, { dockerFail: true, extraCliLine: "" })
    expect(refusedResult.status).toBe(2)
    expect(refusedResult.output).toContain("Could not connect")
    assertNoSecret(refusedResult.output)
    for (const created of [missing, invalid, productionShaped, escaped, refused]) {
      rmSync(created.root, { recursive: true, force: true })
    }
  })

  it("follows an explicit migration-head parameter and still uploads on drift", () => {
    const drifted = fixture()
    mkdirSync(path.join(drifted.repo, "supabase/migrations"), { recursive: true })
    writeFileSync(
      path.join(drifted.repo, "supabase/migrations/20990101000000_later_change.sql"),
      "-- not the approved head\n",
    )
    const drift = runRunner(drifted, {}, { remoteHead: "20990101000000|later_change", extraCliLine: "" })
    expect(drift.status).toBe(1)
    expect(drift.output).toContain("recovery policy check failed")
    const marker = uploadedFiles(drifted.root).find((file) => file.includes("/completed/"))
    expect(marker).toBeTruthy()
    const manifest = JSON.parse(readFileSync(marker!, "utf8"))
    expect(manifest.migration_aligned).toBe(false)
    expect(manifest.repo_migration_head).toBe(APPROVED_HEAD)
    expect(manifest.database_migration_head).toBe("20990101000000|later_change")

    const released = fixture()
    const updated = runRunner(
      released,
      { APPROVED_MIGRATION_HEAD: "20990101000000_later_change" },
      { remoteHead: "20990101000000|later_change", extraCliLine: "" },
    )
    expect(updated.status).toBe(0)
    const updatedMarker = uploadedFiles(released.root).find((file) => file.includes("/completed/"))
    expect(JSON.parse(readFileSync(updatedMarker!, "utf8")).migration_aligned).toBe(true)
    expect(updated.output).toContain("Migration head aligned: true")
    rmSync(drifted.root, { recursive: true, force: true })
    rmSync(released.root, { recursive: true, force: true })
  })

  it("keeps the duplicate guard and the four-hour RPO alarm", () => {
    const recent = fixture()
    writeFileSync(path.join(recent.awsRoot, "list-result.txt"), `${isoSecondsAgo(60)}\n`)
    const skipped = runRunner(recent, {}, { extraCliLine: "" })
    expect(skipped.status).toBe(0)
    expect(skipped.output).toContain("No full backup is required")
    assertNoSecret(skipped.output)
    expect(uploadedFiles(recent.root)).toEqual([])
    expect(existsSync(path.join(recent.root, "docker.log"))).toBe(false)

    const stale = fixture()
    writeFileSync(path.join(stale.awsRoot, "list-result.txt"), `${isoSecondsAgo(20000)}\n`)
    const gap = runRunner(stale, {}, { extraCliLine: "" })
    expect(gap.status).toBe(1)
    const gapMarker = uploadedFiles(stale.root).find((file) => file.includes("/completed/"))
    expect(JSON.parse(readFileSync(gapMarker!, "utf8")).previous_backup_gap_over_rpo).toBe(true)
    expect(gap.output).toContain("Previous backup gap >4h: true")
    rmSync(recent.root, { recursive: true, force: true })
    rmSync(stale.root, { recursive: true, force: true })
  })

  it("fails closed when the pinned CLI version or binary is not what was reviewed", () => {
    const wrongVersion = fixture()
    const version = runRunner(wrongVersion, {}, { npmVersion: "9.9.9", extraCliLine: "" })
    expect(version.status).toBe(2)
    expect(version.output).toContain("does not match the approved version")
    expect(existsSync(path.join(wrongVersion.root, "supabase.log"))).toBe(false)

    const missingBinary = fixture()
    const binary = runRunner(missingBinary, {}, { skipBinary: true, extraCliLine: "" })
    expect(binary.status).toBe(2)
    expect(binary.output).toContain("linux-x64 binary is missing")
    rmSync(wrongVersion.root, { recursive: true, force: true })
    rmSync(missingBinary.root, { recursive: true, force: true })
  })

  it("matches the documented restore package", () => {
    const backupDoc = readFileSync(backupDocPath, "utf8")
    expect(backupDoc).toContain("roles.sql")
    expect(backupDoc).toContain("schema.sql")
    expect(backupDoc).toContain("data.sql")
    expect(backupDoc).toContain("history_schema.sql")
    expect(backupDoc).toContain("history_data.sql")
    expect(backupDoc).toContain("verify the archive SHA-256 exactly")
    const awsDoc = readFileSync(awsDocPath, "utf8")
    expect(awsDoc).toContain("ApprovedMigrationHead")
    expect(awsDoc).toContain("ApprovedRunnerCommit")
    expect(awsDoc).toContain("at least 2 hours old")
    expect(awsDoc).toContain("Do not delete the stack")
    expect(runner.includes(Buffer.from("set -x"))).toBe(false)
    expect(runner.includes(Buffer.from('backup_format: "profilerelaunch-logical-v1"'))).toBe(true)
  })
})
