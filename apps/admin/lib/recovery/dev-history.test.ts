import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { findMigration, manifestVersions, migrationHead, pendingMigrations } from "./manifest"

const root = new URL("../../../../", import.meta.url)

const recovered = [
  {
    version: "20261016175917",
    filename: "20261016175917_admin_journey_02_dev_intake_review_screening_v1.sql",
    sha256: "147c2475b5ed2b596191b5c7d8c9b124995dc056da9b5a528639c70a943c7382",
    bytes: 11802,
    chars: 11802,
    containsDataChange: false,
    document: "docs/admin/proposed-admin-journey-02.sql",
    equality: "normalized",
  },
  {
    version: "20261017111446",
    filename: "20261017111446_admin_journey_03b_evidence_draft_wording_dev_v1.sql",
    sha256: "a35e909f07ad535b5a5a46fe9278d85f99883ca51a3ed89df798f0d734c6b444",
    bytes: 10491,
    chars: 10491,
    containsDataChange: false,
    document: "docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql",
    equality: "bytes",
  },
  {
    version: "20261017113702",
    filename: "20261017113702_get_help_legacy_country_match_dev_v1.sql",
    sha256: "1bba4beca6371a30e3bae5e07e1fed5d8c55fd02fdd34ae4eb949af5d84ca1f3",
    bytes: 12909,
    chars: 12909,
    containsDataChange: false,
    document: "docs/customer/proposed-intake-country-key-v1.sql",
    equality: "normalized",
  },
  {
    version: "20261017145801",
    filename: "20261017145801_admin_journey_03c_customer_templates_v2_draft_dev.sql",
    sha256: "27fd47e35aa3ffd514b1db495eda57c9459bf0ece5b7ed403f4599698cf8bb5d",
    bytes: 2690,
    chars: 2686,
    containsDataChange: true,
    document: "docs/admin/20261017143000_admin_journey_communication_templates_v2.sql",
    equality: "bytes",
  },
  {
    version: "20261017210826",
    filename: "20261017210826_comms_brand_evidence_request_v3_dev.sql",
    sha256: "0ad8b518b98836de804978c53f5beba90a8b12a9481787723ee8b9dd02b216a5",
    bytes: 34443,
    chars: 34433,
    containsDataChange: true,
    document: "docs/admin/20261017170000_comms_brand_evidence_request_v3.sql",
    equality: "bytes",
  },
  {
    version: "20261017215625",
    filename: "20261017215625_admin_template_full_body_preview_dev_v1.sql",
    sha256: "498937cfdf285e21d510269640eedf4e0851e15449c41b81e7816d0310e5f689",
    bytes: 1244,
    chars: 1244,
    containsDataChange: false,
    document: "docs/admin/proposed-admin-template-full-preview-v1.sql",
    equality: "bytes",
  },
  {
    version: "20261019163645",
    filename: "20261019163645_admin_journey_05_assessment_dev_v1.sql",
    sha256: "59cf85ef08606b940c2387a84b6bb8ba0a823769f605096b7bb7b055c7618c7c",
    bytes: 20283,
    chars: 20283,
    containsDataChange: false,
    document: "docs/admin/proposed-admin-journey-05-assessment.sql",
    equality: "normalized",
  },
] as const

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8")
}

/** Drop SQL comments, then whitespace. This is a review comparison, not a byte identity. */
function normalized(sql: string): string {
  return sql
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .map(line => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\s+/g, "")
}

describe("DEV-HISTORY-01 recovered statements", () => {
  it("locks the seven applied statements and recognises DEV-applied Step 10B", () => {
    expect(pendingMigrations()).toEqual([])
    expect(manifestVersions().at(-1)).toBe(migrationHead.version)
    expect(manifestVersions().at(-2)).toBe("20261101170000")
    expect(manifestVersions().at(-3)).toBe("20261031160000")
    expect(manifestVersions().at(-4)).toBe("20261031150000")
    expect(manifestVersions().at(-5)).toBe("20261031140000")
    expect(manifestVersions().at(-6)).toBe("20261031120000")
    expect(manifestVersions().at(-7)).toBe("20261030200000")
    expect(manifestVersions().at(-8)).toBe("20261030130000")
    expect(manifestVersions().at(-9)).toBe("20261030120000")
    expect(manifestVersions().at(-10)).toBe("20261029010000")
    expect(manifestVersions().at(-11)).toBe("20261029000000")
    expect(manifestVersions().at(-12)).toBe("20261028223000")
    expect(manifestVersions().at(-13)).toBe("20261028200000")
    expect(manifestVersions().at(-14)).toBe("20261028160000")
    expect(manifestVersions().at(-15)).toBe("20261028120000")
    expect(manifestVersions().at(-16)).toBe("20261027120000")
    expect(manifestVersions().at(-17)).toBe("20261026190000")
    expect(manifestVersions().at(-18)).toBe("20261026180000")
    expect(manifestVersions().at(-19)).toBe("20261026170000")
    expect(manifestVersions().at(-20)).toBe("20261026140000")
    expect(manifestVersions().at(-21)).toBe("20261025163000")
    expect(manifestVersions().at(-22)).toBe("20261025160000")
    expect(manifestVersions().at(-23)).toBe("20261025140000")
    expect(manifestVersions().at(-24)).toBe("20261025020000")
    expect(manifestVersions().at(-25)).toBe("20261024233701")
    expect(manifestVersions().at(-26)).toBe("20261024190832")
    expect(manifestVersions().at(-27)).toBe("20261024085235")
    expect(manifestVersions().at(-28)).toBe("20261023221042")
    expect(manifestVersions().at(-29)).toBe("20261023221028")
    expect(manifestVersions().at(-30)).toBe("20261023144943")
    expect(manifestVersions().at(-31)).toBe("20261023103232")
    expect(manifestVersions().at(-32)).toBe("20261023091735")
    expect(manifestVersions().at(-33)).toBe("20261023000158")
    expect(manifestVersions().at(-34)).toBe("20261022172455")
    expect(manifestVersions().at(-35)).toBe("20261022124813")
    expect(manifestVersions().at(-36)).toBe("20261021214813")
    expect(manifestVersions().at(-37)).toBe("20261021155147")
    expect(manifestVersions().at(-38)).toBe("20261021132018")
    expect(manifestVersions().at(-39)).toBe("20261020210000")
    expect(manifestVersions().at(-40)).toBe("20261020150000")
    expect(manifestVersions().at(-41)).toBe("20261020120000")
    expect(manifestVersions().at(-42)).toBe("20261019235000")
    for (const item of recovered) {
      const sql = read(`supabase/migrations/${item.filename}`)
      const bytes = Buffer.byteLength(sql)
      expect(bytes).toBe(item.bytes)
      expect(sql.length).toBe(item.chars)
      expect(createHash("sha256").update(sql).digest("hex")).toBe(item.sha256)
      const entry = findMigration(item.filename)
      expect(entry?.version).toBe(item.version)
      expect(entry?.appliedToDev).toBe(true)
      expect(entry?.safeToReplay).toBe(false)
      expect(entry?.containsDataChange).toBe(item.containsDataChange)
      const document = read(item.document)
      if (item.equality === "bytes") expect(sql).toBe(document)
      else expect(normalized(sql)).toBe(normalized(document))
    }
  })
})
