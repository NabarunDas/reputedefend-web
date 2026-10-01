import { describe, expect, it } from "vitest"
import { type EnvMap } from "../jobs/config"
import { capability, liveCapabilities, liveCapabilityIds, liveCapabilityStates, nonEnablingTruthyValues } from "./gates"
import { environmentContract } from "./environment"

/**
 * This suite proves, from code, that nothing accidental turns a live provider
 * effect on. It never reads the real process environment and never contacts a
 * provider: every configuration below is synthetic and every credential-shaped
 * string is obviously fake, so the whole suite runs in CI without a single
 * production secret.
 */

const capabilityIds = liveCapabilities.map(entry => entry.id)

/** A production deployment with nothing optional configured. */
const bareProduction: EnvMap = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  ADMIN_AUTH_ENABLED: "true",
  ADMIN_ORIGIN: "https://admin.profilerelaunch.com",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "placeholder-not-a-key",
  SUPABASE_PUBLISHABLE_KEY: "placeholder-not-a-key",
}

/**
 * Every credential the six capabilities could possibly want, all present and
 * all well formed, with no enable flag set anywhere. If a capability reads
 * live here, credentials alone are enough to produce an external effect,
 * which is exactly the failure this step exists to rule out.
 */
const everyCredentialNoFlags: EnvMap = {
  ...bareProduction,
  RESEND_API_KEY: "placeholder-resend-credential",
  RESEND_WEBHOOK_SECRET: "placeholder-webhook-secret",
  RESEND_INBOUND_WEBHOOK_SECRET: "placeholder-inbound-secret",
  COMMUNICATIONS_FROM_EMAIL: "noreply@example.com",
  COMMUNICATIONS_LINK_SECRET: "placeholder-link-secret-at-least-32-chars",
  INBOUND_MAIL_DOMAIN: "mail.example.com",
  INBOUND_OWNED_ADDRESSES: "noreply@example.com",
  STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
  STRIPE_WEBHOOK_SECRET: "placeholder-stripe-webhook",
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "placeholder-client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "placeholder-client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.profilerelaunch.com/api/integrations/google/callback",
  GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "placeholder-token-key-at-least-32-characters",
  AWS_REGION: "eu-west-2",
  AWS_EVIDENCE_BUCKET: "placeholder-evidence-bucket",
  AWS_EVIDENCE_ROLE_ARN: "arn:aws:iam::000000000000:role/placeholder",
  CRON_SECRET: "placeholder-cron-secret",
  JOB_WORKER_CADENCE_SECONDS: "60",
}

describe("release safety: live capability defaults", () => {
  it("covers the six capabilities that produce an effect outside ProfileRelaunch", () => {
    expect(capabilityIds).toEqual([
      "google_api",
      "stripe_payments",
      "outgoing_mail",
      "inbound_mail",
      "guard_automation",
      "privacy_deletion",
    ])
  })

  it("enables nothing when the environment is empty", () => {
    expect(liveCapabilityIds({})).toEqual([])
  })

  it("enables nothing on a production deployment with nothing optional configured", () => {
    expect(liveCapabilityIds(bareProduction)).toEqual([])
  })

  it("enables nothing when every credential is present and no enable flag is set", () => {
    // Provider credentials must never be sufficient on their own. This is the
    // single most load-bearing assertion in the release check.
    expect(liveCapabilityIds(everyCredentialNoFlags)).toEqual([])
  })

  it("enables nothing from the committed example configuration", () => {
    const example = Object.fromEntries(
      [
        "RESEND_API_KEY=re_xxxxxxxx",
        "ENQUIRY_FROM_EMAIL=enquiries@reputedefend.com",
        "ENQUIRY_TO_EMAIL=owner@example.com",
        "CASE_PERSISTENCE_ENABLED=false",
        "MONITORING_PERSISTENCE_ENABLED=false",
        "SITE_LAUNCHED=false",
      ].map(line => line.split("=") as [string, string]),
    )
    expect(liveCapabilityIds({ ...bareProduction, ...example })).toEqual([])
  })

  it("treats every near-miss spelling of true as off", () => {
    for (const flag of liveCapabilities.flatMap(entry => entry.enableFlags)) {
      for (const value of nonEnablingTruthyValues) {
        const env = { ...everyCredentialNoFlags, JOB_WORKER_ENABLED: value, JOB_PROVIDER_MODE: value, [flag]: value }
        expect({ flag, value, live: liveCapabilityIds(env) }).toEqual({ flag, value, live: [] })
      }
    }
  })

  it("keeps every capability off outside a Vercel production deployment", () => {
    // Preview deployments share the repository and may share configuration.
    // Nothing that reaches a customer may depend on remembering that.
    const allFlagsOn: EnvMap = {
      ...everyCredentialNoFlags,
      VERCEL_ENV: "preview",
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      COMMUNICATIONS_SEND_ENABLED: "true",
      COMMUNICATIONS_INBOUND_ENABLED: "true",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
      GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
    }
    const live = liveCapabilityIds(allFlagsOn)
    expect(live).not.toContain("outgoing_mail")
    expect(live).not.toContain("inbound_mail")
    expect(live).not.toContain("google_api")
  })
})

describe("release safety: each capability needs its own deliberate action", () => {
  it("leaves Google unavailable however the environment is configured", () => {
    const fullyConfigured: EnvMap = {
      ...everyCredentialNoFlags,
      GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
      GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
    }
    // Configuration is complete; execution still is not, because the live
    // stack is a code fact rather than a setting.
    expect(liveCapabilityIds(fullyConfigured)).toEqual([])
    expect(capability("google_api").codeLevelBlock).toContain("googleLiveStack is null")
  })

  it("refuses a live Stripe key rather than using it", () => {
    const liveKey: EnvMap = {
      ...everyCredentialNoFlags,
      PAYMENTS_PROVIDER_MODE: "stripe_test",
      STRIPE_SECRET_KEY: "sk_live_placeholdernotarealkey",
    }
    expect(liveCapabilityIds(liveKey)).toEqual([])
  })

  it("has no provider mode value that selects live Stripe", () => {
    for (const mode of ["stripe_live", "live", "production", "stripe"]) {
      expect(liveCapabilityIds({ ...everyCredentialNoFlags, PAYMENTS_PROVIDER_MODE: mode })).toEqual([])
    }
  })

  it("keeps outgoing mail off until all six of its conditions hold", () => {
    const complete: EnvMap = {
      ...everyCredentialNoFlags,
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
    }
    expect(liveCapabilityIds(complete)).toEqual(["outgoing_mail"])
    // Removing any single condition closes it again.
    for (const name of [
      "COMMUNICATIONS_SEND_ENABLED",
      "JOB_WORKER_ENABLED",
      "JOB_PROVIDER_MODE",
      "RESEND_API_KEY",
      "COMMUNICATIONS_FROM_EMAIL",
      "VERCEL_ENV",
    ]) {
      expect({ name, live: liveCapabilityIds({ ...complete, [name]: undefined }) }).toEqual({ name, live: [] })
    }
  })

  it("keeps outgoing mail off while the worker runs at the daily cadence", () => {
    const dailyCadence: EnvMap = {
      ...everyCredentialNoFlags,
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      JOB_WORKER_CADENCE_SECONDS: "86400",
    }
    // The unchanged 0 4 * * * schedule is itself a gate on live mail.
    expect(liveCapabilityIds(dailyCadence)).toEqual([])
  })

  it("does not let outgoing mail activation enable inbound mail", () => {
    const outgoingOnly: EnvMap = {
      ...everyCredentialNoFlags,
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
    }
    expect(liveCapabilityIds(outgoingOnly)).toEqual(["outgoing_mail"])
  })

  it("refuses to receive inbound mail on the apex domain", () => {
    const apex: EnvMap = {
      ...everyCredentialNoFlags,
      COMMUNICATIONS_INBOUND_ENABLED: "true",
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      INBOUND_MAIL_DOMAIN: "profilerelaunch.com",
    }
    // The apex carries the Google Workspace mailbox that Admin sign-in codes
    // are delivered to, so pointing inbound MX at it would cost sign-in.
    expect(liveCapabilityIds(apex)).toEqual([])
  })

  it("treats each Guard automation flag as its own switch", () => {
    for (const flag of ["GUARD_CHECKS_ENABLED", "GUARD_ALERTS_ENABLED", "GUARD_ALERT_NOTIFICATIONS_ENABLED"]) {
      expect(liveCapabilityIds({ ...bareProduction, [flag]: "true" })).toEqual(["guard_automation"])
    }
  })

  it("does not treat Guard activation or billing flags as automation", () => {
    for (const flag of ["GUARD_ACTIVATION_ENABLED", "GUARD_SUBSCRIPTIONS_ENABLED", "GUARD_REFUNDS_ENABLED"]) {
      expect(liveCapabilityIds({ ...bareProduction, [flag]: "true" })).toEqual([])
    }
  })

  it("needs exactly one flag for privacy deletion and nothing else", () => {
    expect(liveCapabilityIds({ ...bareProduction, PRIVACY_DELETION_ENABLED: "true" })).toEqual(["privacy_deletion"])
    expect(liveCapabilityIds({ ...bareProduction, PRIVACY_DELETION_ENABLED: "True" })).toEqual([])
  })
})

describe("release safety: the capability model matches the environment contract", () => {
  it("names only variables the contract classifies", () => {
    const named = liveCapabilities.flatMap(entry => [...entry.enableFlags, ...entry.credentials])
    const unknown = named.filter(name => !environmentContract.some(entry => entry.name === name))
    expect([...new Set(unknown)]).toEqual([])
  })

  it("expects every enable flag to be absent at Admin cutover", () => {
    const present = liveCapabilities
      .flatMap(entry => entry.enableFlags)
      .filter(name => environmentContract.find(entry => entry.name === name)?.atAdminCutover !== "ABSENT")
    expect(present).toEqual([])
  })

  it("never lists a credential as an enable flag", () => {
    const overlap = liveCapabilities.flatMap(entry => entry.enableFlags.filter(flag => entry.credentials.includes(flag)))
    expect(overlap).toEqual([])
  })

  it("explains why each capability is off in operator language", () => {
    const states = liveCapabilityStates(bareProduction)
    expect(states.every(state => !state.live)).toBe(true)
    expect(states.every(state => state.whyOff.length > 30)).toBe(true)
  })
})
