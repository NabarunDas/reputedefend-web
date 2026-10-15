// Ephemeral DEV-only build-time check for the actual Vercel Preview restricted Stripe key.
// No Stripe objects are created, no secret or account data is logged.
// Remove this temporary integration probe after reviewing both Vercel Preview builds.
import Stripe from "stripe"

if (process.env.VERCEL_ENV !== "preview" || process.env.PAYMENTS_PROVIDER_MODE !== "stripe_test") {
  console.log("[DEV_STRIPE_KEY_CHECK] skipped (not the active Preview sandbox lane)")
  process.exit(0)
}
if (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF !== "develop") {
  console.error("[DEV_STRIPE_KEY_CHECK] unexpected Preview branch")
  process.exit(1)
}
if (process.env.SUPABASE_URL !== "https://rmzozuiamjcclvtgutgd.supabase.co"
  || process.env.AWS_EVIDENCE_BUCKET !== "profilerelaunch-evidence-dev-01") {
  console.error("[DEV_STRIPE_KEY_CHECK] refused mismatched DEV data lane")
  process.exit(1)
}
const key = process.env.STRIPE_SECRET_KEY || ""
if ((!key.startsWith("rk_test_") && !key.startsWith("sk_test_")) || key.length < 16) {
  console.error("[DEV_STRIPE_KEY_CHECK] missing or non-sandbox key")
  process.exit(1)
}
if (!/^whsec_[A-Za-z0-9]+$/.test(process.env.STRIPE_WEBHOOK_SECRET || "")) {
  console.error("[DEV_STRIPE_KEY_CHECK] missing or invalid webhook signing secret")
  process.exit(1)
}
const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 10000 })
const checks = [
  ["customers.read", () => stripe.customers.list({ limit: 1 })],
  ["checkout_sessions.read", () => stripe.checkout.sessions.list({ limit: 1 })],
  ["invoices.read", () => stripe.invoices.list({ limit: 1 })],
  ["subscriptions.read", () => stripe.subscriptions.list({ limit: 1 })],
  ["payment_intents.read", () => stripe.paymentIntents.list({ limit: 1 })],
  ["refunds.read", () => stripe.refunds.list({ limit: 1 })],
  ["disputes.read", () => stripe.disputes.list({ limit: 1 })],
  ["setup_intents.read", () => stripe.setupIntents.list({ limit: 1 })],
]
const results = await Promise.allSettled(checks.map(([, fn]) => fn()))
let failures = 0
for (let i = 0; i < results.length; i++) {
  const result = results[i]
  if (result.status === "fulfilled" && result.value?.object === "list") {
    console.log("[DEV_STRIPE_KEY_CHECK] " + checks[i][0] + ": PASS")
  } else {
    failures++
    const reason = result.status === "rejected" ? result.reason : null
    const status = typeof reason?.statusCode === "number" ? reason.statusCode : "unavailable"
    const kind = typeof reason?.type === "string" ? reason.type : "unexpected_response"
    // Never log Stripe's full error message, request, config or API credential.
    console.error("[DEV_STRIPE_KEY_CHECK] " + checks[i][0] + ": FAIL status=" + status + " type=" + kind)
  }
}
if (failures) {
  console.error("[DEV_STRIPE_KEY_CHECK] " + failures + " required read permissions unavailable")
  process.exit(1)
}
console.log("[DEV_STRIPE_KEY_CHECK] ALL READ CHECKS PASSED; live payments untouched")
