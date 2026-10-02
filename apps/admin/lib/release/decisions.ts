/**
 * Decisions that belong to the Owner, recorded here so they are visible and
 * countable rather than buried in prose, and so no part of the system quietly
 * adopts a value nobody chose.
 *
 * Nothing in this file picks an answer. Where an old blueprint suggested a
 * number, that is recorded as prior art and explicitly not as the decision.
 */

export type DecisionArea =
  | "Guard operations"
  | "Service commitments"
  | "Data retention"
  | "Commercial and legal"
  | "Recovery objectives"
  | "Production database"
  | "Activation order"

export type OwnerDecision = {
  id: string
  area: DecisionArea
  /** The question, phrased so that an answer can be written down. */
  question: string
  /** What the system does today in the absence of an answer. */
  currentBehaviour: string
  /** What cannot happen until it is answered. */
  blocks: string
  /**
   * A value an earlier document suggested, recorded so it is not mistaken for
   * a decision. Null where no prior figure exists.
   */
  priorSuggestion: string | null
}

export const ownerDecisions: readonly OwnerDecision[] = [
  {
    id: "guard.check-windows",
    area: "Guard operations",
    question: "What are the production Guard check windows, in Europe/London, including weekends and bank holidays?",
    currentBehaviour:
      "No schedule version is approved, so no obligation is generated. Europe/London is authoritative and weekends and bank holidays are included in the model.",
    blocks: "Selling Guard. A monitoring promise with no approved clock behind it cannot be evidenced.",
    priorSuggestion: "Earlier material described twice-daily checks. That is prior art, not an approved schedule.",
  },
  {
    id: "guard.capacity",
    area: "Guard operations",
    question: "How many locations can one operator check manually in a day, and what happens when that number is exceeded?",
    currentBehaviour:
      "The queue lists every obligation for the day. Nothing throttles intake and nothing marks an obligation as skipped for capacity.",
    blocks: "Committing to a Guard customer volume.",
    priorSuggestion: null,
  },
  {
    id: "service.first-response",
    area: "Service commitments",
    question: "What is the first-response target for an enquiry and for a case, and during which service hours?",
    currentBehaviour:
      "No response target and no service hours version is approved. A response target cannot be approved before service hours are.",
    blocks: "Publishing a response commitment and reporting against it.",
    priorSuggestion: null,
  },
  {
    id: "retention.periods",
    area: "Data retention",
    question: "What is the retention period for each data category, and which categories are retained regardless of a deletion request?",
    currentBehaviour:
      "No retention policy is approved. The privacy preview separates retained from blocked categories without asserting a period.",
    blocks: "Answering a deletion request with a defensible period, and enabling physical deletion at all.",
    priorSuggestion: null,
  },
  {
    id: "commercial.tax",
    area: "Commercial and legal",
    question: "Is ProfileRelaunch VAT registered, do catalogue prices include tax, and which terms apply at the point of payment?",
    currentBehaviour:
      "Seeded prices are explicitly tax-unconfirmed. Tax behaviour is an explicit field on a quote rather than an assumption.",
    blocks: "Taking the first payment.",
    priorSuggestion: null,
  },
  {
    id: "recovery.objectives",
    area: "Recovery objectives",
    question: "What recovery point and recovery time objective is ProfileRelaunch committing to for the database and for evidence objects?",
    currentBehaviour:
      "Step 22A measured local rehearsal timings. Those are measurements of a rebuild on a developer machine and are not a commitment.",
    blocks: "Final production sign-off, and any customer-facing availability statement.",
    priorSuggestion: "Local rehearsal timings exist in the Step 22A report. They must not be promoted into a target.",
  },
  {
    id: "database.production-topology",
    area: "Production database",
    question:
      "Does production come from a new project built from the canonical migration chain (Strategy A), or from promoting the existing development project (Strategy B)?",
    currentBehaviour:
      "There is one database, profilerelaunch-dev, whose remote ledger begins three migrations after the repository chain does.",
    blocks: "Everything downstream of a production database: cutover, smoke testing and sign-off.",
    priorSuggestion: null,
  },
  {
    id: "activation.order",
    area: "Activation order",
    question: "In what order are the optional capabilities activated after Admin is in production, and who approves each one?",
    currentBehaviour:
      "Every capability is off and each has its own gate, so any order is technically possible. The cutover sequence proposes one order and does not impose it.",
    blocks: "Nothing immediately. Recording it prevents two capabilities being switched on in the same change.",
    priorSuggestion: null,
  },
]

/**
 * The two ways a production database can come into existence, given that the
 * development project's migration ledger does not start where the repository
 * chain does. Neither is implemented here, and nothing in Step 24A chooses
 * between them.
 */
export type DatabaseStrategy = {
  id: "A" | "B"
  name: string
  summary: string
  advantages: string[]
  risks: string[]
  /** What would have to be true before this strategy could be carried out. */
  prerequisites: string[]
  /** The thing that must never be done while following it. */
  prohibited: string[]
}

export const productionDatabaseStrategies: readonly DatabaseStrategy[] = [
  {
    id: "A",
    name: "Build production from the canonical repository chain",
    summary:
      "Create a new Supabase project and apply the 27 repository migrations in order from empty. Production then has a ledger that matches the repository exactly, and profilerelaunch-dev stays a development database.",
    advantages: [
      "The ledger discrepancy does not exist in production, because the three foundation migrations are applied there in the normal way.",
      "The history validator can read clean against production, so the Step 22A fail-closed check is meaningful rather than permanently degraded.",
      "The legacy objects public.set_case_public_ref and public.rls_auto_enable never exist, because no repository migration creates them.",
      "The rehearsal already proves this exact path: apps/admin/lib/recovery rebuilds the whole chain from zero on every test run.",
    ],
    risks: [
      "Any data in the development database is not carried over. Whether that matters is a question about what that data is, which has to be answered before the project is created.",
      "A new project needs its own Auth configuration, its own Admin identity row and its own keys, so the Admin cutover checklist has to be followed from the start.",
    ],
    prerequisites: [
      "A decision about whether anything in profilerelaunch-dev must be preserved.",
      "Step 22B, so that the restore path is rehearsed against a real project before production depends on it.",
    ],
    prohibited: [
      "Do not copy the development ledger into the new project.",
      "Do not skip the three foundation migrations on the grounds that development skipped them.",
    ],
  },
  {
    id: "B",
    name: "Promote the existing development project to production",
    summary:
      "Keep profilerelaunch-dev and its data, and treat it as production. The ledger discrepancy and the two legacy objects come with it and have to be addressed in place.",
    advantages: [
      "Existing data and the applied schema are preserved exactly as they are today, with no replay of anything.",
      "No new Auth configuration, identity row or key set is needed.",
    ],
    risks: [
      "The remote ledger stays three migrations short of the repository chain, so the history validator cannot read clean and the fail-closed check stays degraded unless the discrepancy is reconciled deliberately.",
      "The legacy objects remain and must be inspected and decided on individually.",
      "A database that was used for development carries whatever was done to it by hand. The repository cannot describe that, so a review of the live schema against the canonical chain becomes a prerequisite rather than a formality.",
    ],
    prerequisites: [
      "A documented reconciliation of the ledger that does not involve replaying or fabricating history rows.",
      "A schema comparison between the live database and a database rebuilt from the canonical chain.",
      "The legacy-object inspection, read and decided.",
      "Step 22B, against this project.",
    ],
    prohibited: [
      "Do not replay, reapply or rename 20260915120000_core_data_foundation_v1.sql, 20260915193000_case_intake_transaction_v1.sql or 20260916000000_relaunch_guard_data_foundation_v1.sql.",
      "Do not insert migration-history rows to make the ledger look complete.",
      "Do not mark the live ledger clean in the validator to silence the finding.",
    ],
  },
]

export function strategy(id: "A" | "B"): DatabaseStrategy {
  const found = productionDatabaseStrategies.find(entry => entry.id === id)
  if (!found) throw new Error(`Unknown strategy: ${id}`)
  return found
}

export function decisionsByArea(area: DecisionArea): OwnerDecision[] {
  return ownerDecisions.filter(entry => entry.area === area)
}
