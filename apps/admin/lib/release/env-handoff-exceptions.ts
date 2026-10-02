/**
 * The only places production source may hand a whole environment object to
 * another function.
 *
 * `source-scan.ts` rejects whole-environment hand-off by default, because a
 * call tells the reader nothing about what the receiving function does with
 * the object: it could read a name under any spelling, copy it, or forward it
 * again. Nothing about a call site proves otherwise, so nothing is inferred
 * from one.
 *
 * What remains is this table. Every entry was read and accepted by hand, and
 * the scanner refuses any hand-off that is not listed here by exact callee
 * name and exact file. Adding a hand-off means adding a line to this file,
 * which is the point: it turns an invisible decision into a reviewed one.
 *
 * These are all internal compositions of the configuration gates. They exist
 * because a gate is assembled from smaller gates — outgoing mail asks the
 * provider-mode resolver, the from-address check and the worker cadence — and
 * because `gates.test.ts` proves the Step 24 safety property by driving the
 * outermost gate with a synthetic environment and requiring the innermost one
 * to see it. Giving each helper its own `process.env` default instead would
 * leave the inner gates reading the real environment and make that proof say
 * nothing. Every receiving function is in this repository and is scanned by
 * the same sweep, so the reads inside it are classified like any other.
 *
 * `process.env` itself is never passed, under any exception. Only the
 * injected `env` parameter travels, and only along these edges.
 */

export type EnvHandoffException = {
  /** The callee exactly as written at the call site. */
  helper: string
  /** The files, repository-relative, where that call is accepted. */
  files: string[]
  /** Why this composition exists and why it cannot simply be narrowed. */
  reason: string
}

export const envHandoffExceptions: readonly EnvHandoffException[] = [
  // The job-configuration core. Every provider gate resolves its mode here,
  // so this is the one helper nearly every other composition reaches.
  {
    helper: "resolveProviderMode",
    files: [
      "apps/admin/lib/communications/gate.ts",
      "apps/admin/lib/communications/mail.ts",
      "apps/admin/lib/conversations/gate.ts",
      "apps/admin/lib/jobs/adapters.ts",
      "apps/admin/lib/jobs/config.ts",
    ],
    reason:
      "Resolves JOB_PROVIDER_MODE together with the production guard, which needs VERCEL_ENV as well. Two values, read as one decision.",
  },
  {
    helper: "productionProviderAllowed",
    files: ["apps/admin/lib/jobs/config.ts"],
    reason: "The production guard behind every provider mode. Kept injectable so a synthetic environment can exercise it.",
  },
  {
    helper: "parseWorkerCadenceSeconds",
    files: ["apps/admin/lib/communications/gate.ts", "apps/admin/lib/jobs/config.ts"],
    reason: "Reads JOB_WORKER_CADENCE_SECONDS and is part of the live-mail gate, which must be drivable from a synthetic environment.",
  },
  {
    helper: "canRegisterLiveProvider",
    files: ["apps/admin/lib/communications/mail.ts", "apps/admin/lib/jobs/adapters.ts"],
    reason: "Combines an already-resolved mode with the production guard, so it needs the environment the guard reads.",
  },

  // Outgoing and inbound mail.
  {
    helper: "communicationsSendEnabled",
    files: [
      "apps/admin/lib/communications/gate.ts",
      "apps/admin/lib/communications/handler.ts",
      "apps/admin/lib/release/gates.ts",
      "apps/admin/lib/settings/system-status.ts",
    ],
    reason: "The outgoing-mail capability gate. Reads seven variables and is the gate gates.test.ts drives with synthetic configurations.",
  },
  {
    helper: "communicationsInboundEnabled",
    files: [
      "apps/admin/lib/conversations/attachment.ts",
      "apps/admin/lib/conversations/import.ts",
      "apps/admin/lib/release/gates.ts",
      "apps/admin/lib/settings/system-status.ts",
    ],
    reason: "The inbound-mail capability gate, composed from the provider mode, the worker flag and the inbound domain check.",
  },
  {
    helper: "inboundMailDomain",
    files: ["apps/admin/lib/conversations/gate.ts", "apps/admin/lib/conversations/import.ts"],
    reason: "Reads INBOUND_MAIL_DOMAIN and refuses the apex domain, which is a code-level block the gate test must be able to drive.",
  },
  {
    helper: "inboundOwnedAddresses",
    files: ["apps/admin/lib/conversations/import.ts"],
    reason: "Reads the inbound domain through inboundMailDomain and derives the addresses this deployment owns.",
  },
  {
    helper: "resolveInboundProvider",
    files: ["apps/admin/lib/conversations/import.ts"],
    reason: "Selects the inbound provider from the resolved mode, so it reaches the same job configuration the mode comes from.",
  },
  {
    helper: "resolveInboundAttachmentProvider",
    files: ["apps/admin/lib/conversations/attachment.ts"],
    reason: "Selects the attachment store from the resolved mode and the storage configuration together.",
  },
  {
    helper: "inboundStorageConfig",
    files: ["apps/admin/lib/conversations/attachment.ts"],
    reason: "Reads the four S3 settings as one configuration; splitting them across arguments would hide which combination is valid.",
  },
  {
    helper: "createInboundObjectStore",
    files: ["apps/admin/lib/conversations/attachment.ts"],
    reason: "Builds the object store from the storage configuration it reads, including the credential-absence rule.",
  },
  {
    helper: "resolveMailProvider",
    files: ["apps/admin/lib/communications/handler.ts"],
    reason: "Selects the mail provider from the resolved mode and the sending gate, both of which read the environment.",
  },
  {
    helper: "mailFromAddress",
    files: ["apps/admin/lib/communications/mail.ts"],
    reason: "Reads COMMUNICATIONS_FROM_EMAIL inside the provider construction, where the environment is already in hand.",
  },
  {
    helper: "webhookSecret",
    files: ["apps/admin/lib/communications/webhook.ts"],
    reason: "Reads RESEND_WEBHOOK_SECRET in a handler whose environment is injected so the signature path can be tested.",
  },
  {
    helper: "inboundWebhookSecret",
    files: ["apps/admin/lib/conversations/receive.ts"],
    reason: "Reads RESEND_INBOUND_WEBHOOK_SECRET in a handler whose environment is injected so the signature path can be tested.",
  },
  {
    helper: "linkSecret",
    files: ["apps/admin/lib/communications/link.ts"],
    reason: "Resolves the versioned link secret, the one computed name family in the contract, which needs the whole map to index.",
  },
  {
    helper: "linkSecretForVersion",
    files: ["apps/admin/lib/communications/handler.ts", "apps/admin/lib/communications/link.ts"],
    reason: "Same versioned family, asked for a specific version when verifying a link issued under an earlier key.",
  },
  {
    helper: "currentLinkKeyVersion",
    files: ["apps/admin/lib/communications/link.ts"],
    reason: "Chooses the newest declared link-secret version, which means looking for the family rather than one name.",
  },
  {
    helper: "prepareCommunicationAccessLink",
    files: ["apps/admin/lib/communications/handler.ts"],
    reason: "Issues an access link under the current key version, so it carries the environment the secret family lives in.",
  },

  // Payments.
  {
    helper: "resolvePaymentProviderMode",
    files: [
      "apps/admin/lib/settings/system-status.ts",
      "lib/payments/config.ts",
      "lib/payments/index.ts",
      "lib/payments/stripe.ts",
    ],
    reason: "Resolves PAYMENTS_PROVIDER_MODE against the production guard, the same two-value decision as the job provider mode.",
  },
  {
    helper: "paymentsEnabled",
    files: ["apps/admin/lib/release/gates.ts", "lib/payments/index.ts"],
    reason: "The Stripe capability gate. gates.test.ts drives it with synthetic configurations to prove defaults cannot enable it.",
  },
  {
    helper: "paymentProvider",
    files: ["apps/admin/lib/guard/reconcile.ts", "apps/admin/lib/payments/handlers.ts"],
    reason: "Constructs the payment provider from the resolved mode and the key, which are read together or not at all.",
  },
  {
    helper: "createStripePaymentProvider",
    files: ["lib/payments/index.ts"],
    reason: "Builds the Stripe client from the mode and the test-key rule, which is the code-level block on a live key.",
  },
  {
    helper: "stripeSecret",
    files: ["lib/payments/index.ts"],
    reason: "Reads STRIPE_SECRET_KEY and enforces the sk_test_/rk_test_ prefix rule that rejects a live key in code.",
  },
  {
    helper: "rawSecret",
    files: ["lib/payments/stripe.ts"],
    reason: "Reads the Stripe key for the client factory, alongside the mode that decides whether a client may exist at all.",
  },
  {
    helper: "client",
    files: ["lib/payments/stripe.ts"],
    reason: "Lazily builds the Stripe client, which needs both the key and the resolved mode.",
  },
  {
    helper: "stripeWebhookSecret",
    files: ["apps/admin/lib/payments/webhook.ts"],
    reason: "Reads STRIPE_WEBHOOK_SECRET in a handler whose environment is injected so the signature path can be tested.",
  },

  // Guard.
  {
    helper: "guardChecksEnabled",
    files: ["apps/admin/lib/guard/maintain-checks.ts", "apps/admin/lib/release/gates.ts", "apps/admin/lib/settings/system-status.ts"],
    reason: "One of the three Guard automation flags the capability gate combines; driven from synthetic configurations.",
  },
  {
    helper: "guardAlertsEnabled",
    files: ["apps/admin/lib/guard/maintain-alerts.ts", "apps/admin/lib/release/gates.ts", "apps/admin/lib/settings/system-status.ts"],
    reason: "One of the three Guard automation flags the capability gate combines; driven from synthetic configurations.",
  },
  {
    helper: "guardAlertNotificationsEnabled",
    files: ["apps/admin/lib/release/gates.ts", "apps/admin/lib/settings/system-status.ts"],
    reason: "One of the three Guard automation flags the capability gate combines; driven from synthetic configurations.",
  },
  {
    helper: "guardActivationEnabled",
    files: ["apps/admin/lib/settings/system-status.ts"],
    reason: "Reported on the system-status surface beside the other Guard flags, from the same injected environment.",
  },
  {
    helper: "guardRefundsEnabled",
    files: ["apps/admin/lib/settings/system-status.ts"],
    reason: "Reported on the system-status surface beside the other Guard flags, from the same injected environment.",
  },
  {
    helper: "guardSubscriptionsEnabled",
    files: ["apps/admin/lib/settings/system-status.ts"],
    reason: "Reported on the system-status surface beside the other Guard flags, from the same injected environment.",
  },

  // Google Business Profile. Every one of these is behind googleLiveStack,
  // which is null in this build, so they decide configuration only.
  {
    helper: "googleBusinessProfileApiEnabled",
    files: ["lib/google-business-profile/config.ts", "lib/google-business-profile/resolve.ts"],
    reason: "The Google capability flag, read beside the provider selector so the two cannot disagree.",
  },
  {
    helper: "googleBusinessProfileMode",
    files: ["lib/google-business-profile/config.ts", "lib/google-business-profile/resolve.ts"],
    reason: "Selects the Google provider from the flag and the provider name together.",
  },
  {
    helper: "googleOAuthConfig",
    files: ["lib/google-business-profile/config.ts"],
    reason: "Reads client id, client secret and redirect URI as one configuration; each is useless without the others.",
  },
  {
    helper: "googleTokenEncryptionKey",
    files: ["lib/google-business-profile/config.ts"],
    reason: "Reads GOOGLE_BUSINESS_PROFILE_TOKEN_KEY within the configuration builder that already holds the environment.",
  },
  {
    helper: "googleLiveConfiguration",
    files: [
      "lib/google-business-profile/live-acceptance.ts",
      "lib/google-business-profile/live-stack.ts",
      "lib/google-business-profile/resolve.ts",
    ],
    reason: "Assembles the whole Google live configuration from the flag, the mode, the OAuth settings and the token key.",
  },
  {
    helper: "googleLiveAcceptanceEnabled",
    files: ["lib/google-business-profile/live-acceptance.ts"],
    reason: "The acceptance-run flag, read beside the live configuration it would apply to.",
  },
  {
    helper: "googleConnectExecution",
    files: ["apps/admin/lib/integrations/command.ts", "apps/admin/lib/release/gates.ts"],
    reason: "The Google capability gate. gates.test.ts drives it with synthetic configurations; it reports not-implemented regardless.",
  },
  {
    helper: "googleCallbackOutcome",
    files: ["apps/admin/lib/integrations/command.ts"],
    reason: "The OAuth callback half of the same gate, which needs the same configuration to decide it is not implemented.",
  },

  // Remaining single call sites.
  {
    helper: "privacyDeletionEnabled",
    files: ["apps/admin/lib/release/gates.ts", "apps/admin/lib/settings/system-status.ts"],
    reason: "The physical-deletion capability gate, driven from synthetic configurations by gates.test.ts.",
  },
  {
    helper: "readSupabaseConfig",
    files: ["lib/supabase/config.ts"],
    reason: "Reads the URL and both keys as one configuration and decides which key a caller is allowed to have.",
  },
  {
    helper: "configuredStatusLabel",
    files: ["apps/admin/lib/settings/system-status.ts"],
    reason: "Turns one named variable into a presence label, called once per row from the injected environment.",
  },
  {
    helper: "entry.live",
    files: ["apps/admin/lib/release/gates.ts"],
    reason:
      "The capability table stores each gate as a function so the release check calls the gate the runtime calls rather than a copy of it. The functions it stores are the exported gates listed above.",
  },

  // Job handlers. Each is registered by the worker and receives the worker's
  // environment so the provider it builds matches the resolved mode.
  {
    helper: "collectPaymentHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "importInboundAttachmentHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "importInboundEmailHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "maintainGuardAlertsHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "maintainGuardChecksHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "processStripeEventHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "reconcileGuardBillingHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
  {
    helper: "sendEmailHandler",
    files: ["apps/admin/lib/jobs/adapters.ts"],
    reason: "A worker handler that builds its provider from the resolved mode in the environment it was registered with.",
  },
]

/** Whether this exact callee, in this exact file, is a reviewed exception. */
export function isReviewedHandoff(callee: string, path: string | undefined): boolean {
  if (!path) return false
  return envHandoffExceptions.some(entry => entry.helper === callee && entry.files.includes(path))
}
