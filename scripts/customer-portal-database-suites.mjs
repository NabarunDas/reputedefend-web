/**
 * Customer Portal database suites for the repository release check.
 *
 * Discovery is limited to apps/admin/lib/customer-portal/. A file counts when
 * its name is database.test.ts or ends in .database.test.ts. Other Admin
 * database tests are outside this directory and are not included.
 */

import { readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const adminRoot = fileURLToPath(new URL("../apps/admin/", import.meta.url))
const portalRoot = join(adminRoot, "lib", "customer-portal")

/** UX-10A uses database.test.ts. Later phases use *.database.test.ts. */
export const customerPortalDatabaseTestName = /(^|[.])database\.test\.ts$/

export const requiredCustomerPortalDatabaseSuites = [
  "lib/customer-portal/database.test.ts",
  "lib/customer-portal/dashboard-cases.database.test.ts",
  "lib/customer-portal/case-workspace.database.test.ts",
  "lib/customer-portal/documents-evidence.database.test.ts",
  "lib/customer-portal/quotes-agreements.database.test.ts",
  "lib/customer-portal/payments-receipts.database.test.ts",
  "lib/customer-portal/relaunch-guard.database.test.ts",
  "lib/customer-portal/messages-account.database.test.ts",
  "lib/customer-portal/launch-security.database.test.ts",
]

export function customerPortalDatabaseSuiteFiles() {
  const found = []
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (customerPortalDatabaseTestName.test(entry.name)) {
        found.push(relative(adminRoot, full).split("\\").join("/"))
      }
    }
  }
  walk(portalRoot)
  found.sort()
  return found
}

export function missingCustomerPortalDatabaseSuites(files = customerPortalDatabaseSuiteFiles()) {
  return requiredCustomerPortalDatabaseSuites.filter(file => !files.includes(file))
}
