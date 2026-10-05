import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const template = readFileSync(
  new URL("../../../../infra/aws/prod-evidence.yaml", import.meta.url),
  "utf8",
)

describe("production evidence infrastructure policy", () => {
  it("creates a dedicated production bucket with public access blocked", () => {
    expect(template).toContain("profilerelaunch-evidence-prod-euw2-337909767363")
    expect(template).toContain("BlockPublicAcls: true")
    expect(template).toContain("IgnorePublicAcls: true")
    expect(template).toContain("BlockPublicPolicy: true")
    expect(template).toContain("RestrictPublicBuckets: true")
    expect(template).toContain("BucketOwnerEnforced")
    expect(template).toContain("SSEAlgorithm: AES256")
    expect(template).toContain("Status: Enabled")
  })

  it("trusts only production deployments of the exact Admin and Customer Vercel projects", () => {
    expect(template).toContain("project:${AdminVercelProject}:environment:production")
    expect(template).toContain("project:${CustomerVercelProject}:environment:production")
    expect(template).not.toContain("environment:preview")
    expect(template).not.toContain("project:*")
  })

  it("uses least-privilege evidence roles", () => {
    expect(template).toContain("s3:PutObject")
    expect(template).toContain("s3:GetObject")
    expect(template).toContain("s3:GetObjectTagging")
    expect(template).not.toContain("s3:DeleteObject")
    expect(template).not.toContain('Action: "s3:*"\n                Resource: !Sub "${EvidenceBucket.Arn}/cases/*"')
  })

  it("enables GuardDuty malware scanning and result tagging for cases", () => {
    expect(template).toContain("AWS::GuardDuty::MalwareProtectionPlan")
    expect(template).toContain("ObjectPrefixes:")
    expect(template).toContain("- cases/")
    expect(template).toContain("Tagging:")
    expect(template).toContain("Status: ENABLED")
  })

  it("keeps production browser CORS on production origins only", () => {
    expect(template).toContain("https://admin.profilerelaunch.com")
    expect(template).toContain("https://customer.profilerelaunch.com")
    expect(template).not.toContain("*.vercel.app")
    expect(template).not.toContain("profilerelaunch-evidence-dev-01")
  })
})
