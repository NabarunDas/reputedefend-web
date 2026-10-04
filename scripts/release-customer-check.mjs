/**
 * Repository-safe release check for the Customer Portal.
 *
 * Everything this runs is local. It does not contact a provider, send a
 * one-time code, send email, call Stripe, call Google, read an AWS object,
 * change Supabase, change Vercel, apply a migration, or require a production
 * secret value.
 *
 * A passing run is code readiness only. It is not permission to set
 * CUSTOMER_PORTAL_ENABLED or to launch the portal.
 */

import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { customerPortalDatabaseSuiteFiles, missingCustomerPortalDatabaseSuites } from "./customer-portal-database-suites.mjs"

const repoRoot = new URL("../", import.meta.url)
const node = process.execPath
const databaseSuites = customerPortalDatabaseSuiteFiles()
const missingDatabaseSuites = missingCustomerPortalDatabaseSuites(databaseSuites)
if (databaseSuites.length === 0 || missingDatabaseSuites.length > 0) {
  console.error("Customer portal release check did not discover the required database suites.")
  for (const file of missingDatabaseSuites) console.error(`  missing ${file}`)
  process.exit(1)
}

const customerSuites = [
  ["route and security inventory", "lib/portal/route-inventory.test.ts"],
  ["portal gate", "lib/portal/config.test.ts"],
  ["proxy isolation", "proxy.test.ts"],
  ["portal auth handlers", "lib/portal/http.test.ts"],
  ["portal session", "lib/portal/session.test.ts"],
  ["accessibility invariants", "lib/portal/accessibility.test.ts"],
  ["assembled accessibility", "app/portal/portal-accessibility.test.tsx"],
  ["launch safety", "lib/portal/launch-safety.test.ts"],
]

const adminSuites = [
  ["migration manifest and head", "lib/recovery/manifest.test.ts"],
  ["migration history validation", "lib/recovery/history.test.ts"],
  ["customer portal database coverage", "lib/customer-portal/release-coverage.test.ts"],
  ...databaseSuites.map(file => [file, file]),
]

function run(command, args, cwd) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, stdio: "inherit" })
    child.once("exit", code => resolve(code ?? 1))
  })
}

console.log("Customer portal release check — repository-safe only.")
console.log("Contacts no provider, sends no mail or one-time code, reads no production secret.\n")
console.log("Customer Portal database suites:")
for (const file of databaseSuites) console.log(`  - ${file}`)
console.log("")

const vitest = fileURLToPath(new URL("node_modules/vitest/vitest.mjs", repoRoot))
const customer = await run(node, [vitest, "run", "--config", "vitest.config.ts", ...customerSuites.flatMap(([, file]) => [file])], fileURLToPath(new URL("apps/customer/", repoRoot)))
if (customer !== 0) {
  console.error("\nCustomer portal release check failed.")
  process.exit(customer)
}

const admin = await run(node, [vitest, "run", "--config", "vitest.config.ts", ...adminSuites.flatMap(([, file]) => [file])], fileURLToPath(new URL("apps/admin/", repoRoot)))
if (admin !== 0) {
  console.error("\nCustomer portal release check failed.")
  process.exit(admin)
}

const typecheck = await run("npm", ["run", "typecheck:customer"], fileURLToPath(repoRoot))
if (typecheck !== 0) {
  console.error("\nCustomer portal release check failed.")
  process.exit(typecheck)
}

const build = await run("npm", ["run", "build:customer"], fileURLToPath(repoRoot))
if (build !== 0) {
  console.error("\nCustomer portal release check failed.")
  process.exit(build)
}

const smoke = await run("npm", ["run", "smoke:customer"], fileURLToPath(repoRoot))
if (smoke !== 0) {
  console.error("\nCustomer portal release check failed.")
  process.exit(smoke)
}

console.log("\nRepository checks passed. This is not production launch approval.")
