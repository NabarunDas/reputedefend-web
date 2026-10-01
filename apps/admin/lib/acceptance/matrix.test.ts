/**
 * Keeps the Step 23 acceptance matrix tied to the application it describes.
 *
 * A matrix that is only prose goes stale the first time someone adds a page.
 * These checks read the routes off disk and the evidence files off disk, so a
 * new Admin page without a row, or a row naming a test that no longer exists,
 * fails here.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { acceptanceMatrix, type AcceptanceStatus } from "./matrix"

const appRoot = new URL("../../app/", import.meta.url)
const adminRoot = new URL("../../", import.meta.url)

/** Every page route the App Router would serve, as the route path. */
function pageRoutes(directory = appRoot, prefix = ""): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "page.tsx") routes.push(prefix || "/")
    else if (entry.isDirectory() && entry.name !== "api") {
      // Route groups and private folders do not contribute a path segment.
      const segment = entry.name.startsWith("(") || entry.name.startsWith("_") ? "" : `/${entry.name}`
      routes.push(...pageRoutes(new URL(`${entry.name}/`, directory), prefix + segment))
    }
  }
  return routes
}

const statuses: AcceptanceStatus[] = ["PASS", "FAIL", "NOT_APPLICABLE", "DEFERRED_EXTERNAL"]

describe("Step 23 acceptance matrix", () => {
  it("covers every page the Admin workspace serves", () => {
    const covered = new Set(acceptanceMatrix.flatMap(row => row.routes))
    const uncovered = pageRoutes().filter(route => !covered.has(route)).sort()
    expect(uncovered).toEqual([])
  })

  it("claims no route the Admin workspace does not serve", () => {
    const actual = new Set(pageRoutes())
    const invented = acceptanceMatrix.flatMap(row => row.routes).filter(route => !actual.has(route)).sort()
    expect(invented).toEqual([])
  })

  it("names evidence that is actually on disk", () => {
    const missing = acceptanceMatrix
      .flatMap(row => row.evidence.map(file => ({ area: row.area, file })))
      .filter(entry => !existsSync(new URL(entry.file, adminRoot)))
      .map(entry => `${entry.area}: ${entry.file}`)
    expect(missing).toEqual([])
  })

  it("leaves no row without an expected result, a negative case and evidence", () => {
    const incomplete = acceptanceMatrix
      .filter(row =>
        !row.area || !row.action || !row.expected || !row.authorization || !row.persistence
        || !row.negative || row.evidence.length === 0)
      .map(row => row.area || "(unnamed)")
    expect(incomplete).toEqual([])
  })

  it("explains every row that is not a plain pass", () => {
    for (const row of acceptanceMatrix) {
      expect(statuses).toContain(row.status)
      if (row.status !== "PASS") expect(row.statusNote && row.statusNote.length > 20).toBe(true)
    }
  })

  it("records no failing area, because a failure is a blocker rather than a matrix entry", () => {
    expect(acceptanceMatrix.filter(row => row.status === "FAIL").map(row => row.area)).toEqual([])
  })

  it("names each area once", () => {
    const names = acceptanceMatrix.map(row => row.area)
    expect(names).toEqual([...new Set(names)])
  })

  it("matches the companion table in the Step 23 document", () => {
    // The document is what a reviewer reads. If it can drift from the matrix,
    // one of the two is lying, so the table is derived from the same rows.
    const doc = readFileSync(new URL("../../../../docs/admin/step23-acceptance-security.md", import.meta.url), "utf8")
    const rows = doc.split("\n")
      .filter(line => line.startsWith("| ") && !line.startsWith("| Area") && !line.startsWith("| ---"))
      .map(line => line.split("|").map(cell => cell.trim()).slice(1, -1))
    expect(rows.map(cells => [cells[0], cells[2]])).toEqual(
      acceptanceMatrix.map(row => [row.area, row.status]),
    )
    expect(rows.map(cells => cells[1])).toEqual(
      acceptanceMatrix.map(row => row.routes.map(route => `\`${route}\``).join(", ") || "—"),
    )
  })

  it("holds the deferred items open rather than quietly passing them", () => {
    // Live Stripe, live mail, the live Google API and the Step 22B rehearsal
    // against a restored project are all out of scope by instruction. They are
    // recorded as deferred so Step 24 still has to deal with them.
    expect(acceptanceMatrix.filter(row => row.status === "DEFERRED_EXTERNAL").map(row => row.area).sort()).toEqual([
      "Google Business Profile integration",
      "Guard subscriptions and billing",
      "Migration and recovery rehearsal",
      "Money, payments and invoices",
      "Outgoing communications",
    ])
  })
})
