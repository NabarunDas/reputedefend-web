/**
 * Repository-safe release check for the Admin workspace.
 *
 * Everything this runs is local. It does not contact a provider, send a
 * one-time code, send email, call Stripe, call Google, read an AWS object,
 * change Supabase, change Vercel, or require a production secret value, so it
 * runs unchanged in CI.
 *
 * It deliberately does not decide whether production is ready. External
 * readiness lives in accounts this process cannot observe, so those items are
 * reported as information and the exit code reflects the repository only.
 */

import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const repoRoot = new URL("../", import.meta.url)

const suites = [
  ["environment contract", "lib/release/environment.test.ts"],
  ["gate-default safety", "lib/release/gates.test.ts"],
  ["readiness model", "lib/release/readiness.test.ts"],
  ["cutover sequence and release record", "lib/release/cutover.test.ts"],
  ["secret patterns in release artifacts", "lib/release/secrets.test.ts"],
  ["migration manifest and head", "lib/recovery/manifest.test.ts"],
  ["migration history validation", "lib/recovery/history.test.ts"],
]

console.log("Admin release check — repository-safe only.")
console.log("Contacts no provider, sends no mail or one-time code, reads no production secret.\n")
for (const [name, file] of suites) console.log(`  - ${name} (${file})`)
console.log("")

const vitest = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vitest/vitest.mjs", repoRoot)),
    "run",
    "--config",
    "vitest.config.ts",
    ...suites.map(([, file]) => file),
  ],
  { cwd: fileURLToPath(new URL("apps/admin/", repoRoot)), stdio: "inherit" },
)

const [code] = await new Promise(resolve => vitest.once("exit", (...args) => resolve(args)))
if (code !== 0) {
  console.error("\nRelease check failed. The repository is not in the expected release state.")
  process.exit(code ?? 1)
}

/**
 * The readiness table in the cutover document is asserted against
 * apps/admin/lib/release/readiness.ts by the suite that has just passed, so
 * reading it here reports the model rather than a second copy of it.
 */
const doc = readFileSync(new URL("docs/admin/production-cutover-readiness.md", repoRoot), "utf8")
const section = doc.split("\n## ").find(part => part.startsWith("Readiness model\n")) ?? ""
const rows = section
  .split("\n")
  .filter(line => line.startsWith("| `"))
  .map(line => line.split("|").map(cell => cell.trim()))
  .map(cells => ({ id: cells[1].replaceAll("`", ""), area: cells[2], status: cells[3] }))

const counts = new Map()
for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)

console.log("\nReadiness model")
for (const status of ["READY", "READY_DISABLED", "ACTION_REQUIRED", "BLOCKED", "DEFERRED"]) {
  console.log(`  ${status.padEnd(16)} ${counts.get(status) ?? 0}`)
}

const outstanding = rows.filter(row => row.status !== "READY" && row.status !== "READY_DISABLED")
if (outstanding.length > 0) {
  console.log("\nOutstanding, and not decidable from this repository:")
  for (const row of outstanding) console.log(`  ${row.status.padEnd(16)} ${row.area} — ${row.id}`)
}

console.log("\nRepository checks passed.")
console.log("This is not production sign-off. The items above are observed in external accounts,")
console.log("and Step 22B, the cloud recovery rehearsal, is still required before final sign-off.")
