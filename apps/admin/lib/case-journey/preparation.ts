/**
 * Guided Step 8 reads the existing prepared-pack records.
 *
 * Completion is the current approved, published, non-empty pack, with no
 * live stale pack. Approval does not publish. Publication does not submit
 * to Google. This module does not create a second pack command.
 */

import type { CaseFlowCommunicationFact, CaseFlowEvidenceVersionFact, CaseFlowFacts } from "../case-flow/model"
import type { EligiblePackVersion, PreparedPackCase } from "../packs/model"

export type JourneyPreparationPack = {
  id: string
  number: number
  state: "Draft" | "Approved" | "Published" | "Stale" | "Superseded" | "Unknown"
  items: number
  history: boolean
}

export type JourneyPreparationRequirement = {
  label: string
  state: "Met" | "Not met"
  detail: string
}

export type JourneyPreparationPanel = {
  headline: string
  detail: string
  packs: JourneyPreparationPack[]
  requirements: JourneyPreparationRequirement[]
  notices: string[]
  who: string
  /** The existing pack panel. Null withholds every pack command. */
  commands: PreparedPackCase | null
}

export function packDisplayState(pack: { status: string; published?: boolean }): JourneyPreparationPack["state"] {
  if (pack.status === "SUPERSEDED") return "Superseded"
  if (pack.status === "STALE") return "Stale"
  if (pack.status === "DRAFT") return "Draft"
  if (pack.status === "APPROVED" && pack.published) return "Published"
  if (pack.status === "APPROVED") return "Approved"
  return "Unknown"
}

function safeVersion(version: CaseFlowEvidenceVersionFact | undefined, documentId: string): boolean {
  if (!version || version.documentId !== documentId) return false
  if (version.uploadStatus !== "UPLOADED" || version.scanStatus !== "NO_THREATS_FOUND") return false
  if (version.validationStatus !== "VALID" || version.reviewStatus !== "ACCEPTED") return false
  if (version.submissionSource === "ADMIN") return true
  return !!version.evidenceRequestId
}

export function preparationRecordsDisagree(facts: CaseFlowFacts, packs: PreparedPackCase): boolean {
  const projected = [...facts.packs.packs].sort((a, b) => a.packNumber - b.packNumber || a.id.localeCompare(b.id))
  const loaded = [...packs.packs].sort((a, b) => a.packNumber - b.packNumber || a.id.localeCompare(b.id))
  if (projected.length !== loaded.length || facts.packs.eligibleCount !== packs.eligible.length) return true
  return projected.some((row, index) => {
    const found = loaded[index]
    return row.id !== found.id
      || row.packNumber !== found.packNumber
      || row.status !== found.status
      || row.published !== !!found.published
      || row.itemCount !== found.items.length
  })
}

export function provenEligible(facts: CaseFlowFacts, packs: PreparedPackCase): EligiblePackVersion[] {
  const versions = new Map(facts.evidence.versions.map(version => [version.versionId, version]))
  return packs.eligible.filter(item => safeVersion(versions.get(item.versionId), item.documentId))
}

export type PackReadyNotification = {
  headline: string
  detail: string
  state: "Met" | "Not met"
}

const failedDelivery = new Set(["BOUNCED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE", "COMPLAINED", "SUPPRESSED", "FAILED"])

/**
 * Publication makes the pack available. It does not prove the customer was told.
 * Provider acceptance and a reported delivery stay separate from a download.
 */
export function packReadyNotification(communications: CaseFlowCommunicationFact[]): PackReadyNotification {
  const rows = communications.filter(row => row.templateKey === "GUIDED_PACK_READY" && row.lifecycle !== "CANCELLED")
  const row = [...rows].sort((left, right) => left.draftedAt.localeCompare(right.draftedAt)).at(-1)
  if (!row) {
    return {
      headline: "Available in portal; email not sent",
      detail: "Available in portal; email not sent.",
      state: "Not met",
    }
  }
  const delivery = row.deliveryStatus
  if (delivery === "ACCEPTANCE_UNKNOWN") {
    return {
      headline: "Pack available; provider acceptance is unknown",
      detail: "Provider acceptance is unknown, so another copy was not sent.",
      state: "Not met",
    }
  }
  if (delivery === "DELIVERED") {
    return {
      headline: "Pack available; the provider reported delivery",
      detail: "The provider reported delivery. That is not a download.",
      state: "Met",
    }
  }
  if (delivery === "PROVIDER_ACCEPTED") {
    return {
      headline: "Pack available; the provider accepted the notification",
      detail: "The email provider accepted the notification. That is not proof the customer received it.",
      state: "Not met",
    }
  }
  if (delivery && failedDelivery.has(delivery)) {
    return {
      headline: "Pack available; the notification was not delivered",
      detail: "The notification was not delivered. Resume the same communication only when that is safe.",
      state: "Not met",
    }
  }
  if (row.lifecycle === "QUEUED" && (delivery === "NONE" || delivery == null)) {
    return {
      headline: "Pack available; notification queued",
      detail: "The notification is queued. Queued is not delivered.",
      state: "Not met",
    }
  }
  return {
    headline: "Pack available; provider acceptance is unknown",
    detail: "The notification status is not confirmed, so another copy was not sent.",
    state: "Not met",
  }
}

export type PreparationReadiness = {
  current: CaseFlowFacts["packs"]["packs"][number] | null
  /** The latest pack that is not superseded is approved, published and non-empty. */
  latestPublished: boolean
  stale: boolean
  /** Another approved, non-empty pack is still published. Superseded history does not count. */
  otherPublished: boolean
  /** Latest published pack, no stale pack, no other published pack, and the records agree. */
  ready: boolean
}

/**
 * The same five facts the step and the panel use.
 * This is not a pack state machine. It only reads the projection.
 */
export function preparationReadiness(
  packs: CaseFlowFacts["packs"]["packs"],
  flags: { packRecordsDisagree?: boolean; recordsConflict?: boolean } = {},
): PreparationReadiness {
  const live = packs.filter(pack => pack.status !== "SUPERSEDED")
  const current = live.reduce<(typeof live)[number] | null>(
    (best, pack) => (best === null || pack.packNumber > best.packNumber ? pack : best),
    null,
  )
  const stale = live.some(pack => pack.status === "STALE")
  const latestPublished = !!current && current.status === "APPROVED" && current.published && current.itemCount > 0
  const otherPublished = packs.some(pack => pack !== current && pack.status === "APPROVED" && pack.published && pack.itemCount > 0)
  const ready = latestPublished && !stale && !otherPublished && !flags.packRecordsDisagree && !flags.recordsConflict
  return { current, latestPublished, stale, otherPublished, ready }
}

function listedPack(pack: { id: string; packNumber: number; status: string; published?: boolean; itemCount?: number; items?: { length: number } }): JourneyPreparationPack {
  return {
    id: pack.id,
    number: pack.packNumber,
    state: packDisplayState(pack),
    items: pack.items ? pack.items.length : pack.itemCount ?? 0,
    history: pack.status === "SUPERSEDED",
  }
}

export function buildJourneyPreparationPanel(input: {
  facts: CaseFlowFacts
  packs: PreparedPackCase | null
  recordsConflict: boolean
}): JourneyPreparationPanel {
  const facts = input.facts
  const loaded = input.packs
  const disagreed = !loaded || preparationRecordsDisagree(facts, loaded)
  const notices: string[] = []
  if (!loaded) notices.push("The prepared-pack record could not be loaded, so no pack command is offered from here.")
  else if (disagreed) notices.push("The case projection and the prepared-pack record do not describe the same packs. These records disagree, so no pack command is offered from here.")
  if (input.recordsConflict) notices.push("The customer, business or authority records disagree, so this step does not treat a pack as ready and no pack command is offered from here.")

  const source = loaded ?? null
  const display = (source ? source.packs : facts.packs.packs).map(listedPack)
  const readiness = preparationReadiness(facts.packs.packs, {
    packRecordsDisagree: disagreed,
    recordsConflict: input.recordsConflict,
  })
  const current = readiness.current
  const eligible = loaded ? provenEligible(facts, loaded) : []
  if (loaded && eligible.length !== loaded.eligible.length) {
    notices.push("A listed file is not an accepted, validated, clean version. A customer upload still has to be linked to its request. It is not offered for this pack.")
  }
  if (readiness.otherPublished) {
    notices.push("More than one pack is published, or an earlier pack is still published. These records disagree, so no pack command is offered from here. Resolve the extra published pack on the evidence workspace.")
  }

  const commands = loaded && !disagreed && !input.recordsConflict && !readiness.otherPublished
    ? { ...loaded, eligible }
    : null

  const notification = packReadyNotification(facts.communications)
  const headline = disagreed
    ? "Pack records disagree"
    : readiness.stale
      ? "Replace the stale pack before sending it"
      : readiness.otherPublished
        ? "Another pack is still published"
        : input.recordsConflict
          ? "Case records disagree"
          : !current
            ? "Prepare the submission materials"
            : current.status === "DRAFT" && current.itemCount === 0
              ? "Add the statement, evidence and customer instructions"
              : current.status === "DRAFT"
                ? "Approve the completed pack"
                : current.status === "APPROVED" && !current.published
                  ? "Send the completed pack"
                  : readiness.ready
                    ? notification.headline
                    : "The completed pack is not ready"

  const detail = "Case preparation is the current approved pack after it has been published. Approval does not publish it. Publication uses the existing customer case-access rule and does not submit anything to Google."

  const requirements: JourneyPreparationRequirement[] = [
    {
      label: "Eligible evidence",
      state: !disagreed && ((current?.itemCount ?? 0) > 0 || eligible.length > 0) ? "Met" : "Not met",
      detail: "A staff document does not need an evidence request. A customer upload still has to be linked to its request. An unscanned, rejected or superseded file is not a substitute.",
    },
    {
      label: "Approval",
      state: !disagreed && current?.status === "APPROVED" ? "Met" : "Not met",
      detail: "Approval confirms the selected evidence. It does not publish the pack.",
    },
    {
      label: "Publication",
      state: readiness.ready ? "Met" : "Not met",
      detail: "Publication makes the approved pack available through the existing secure case-access link. It does not create an open document link.",
    },
    {
      label: "Customer notification",
      state: readiness.ready ? notification.state : "Not met",
      detail: readiness.ready
        ? notification.detail
        : "Publishing the pack does not by itself tell the customer. The notification is recorded separately and is not treated as received.",
    },
    {
      label: "Current pack",
      state: readiness.ready ? "Met" : "Not met",
      detail: readiness.stale
        ? "Included evidence changed after approval. The stale pack has to be replaced by a new draft."
        : readiness.otherPublished
          ? "Another approved pack is still published. A superseded pack is history and does not count."
          : "The current pack is the latest one that has not been superseded. A superseded pack stays as history.",
    },
  ]

  const who = disagreed
    ? "ProfileRelaunch reconciles the pack records before changing the pack."
    : readiness.otherPublished
      ? "ProfileRelaunch resolves the extra published pack on the evidence workspace before treating a pack as current."
      : input.recordsConflict
        ? "ProfileRelaunch reconciles the customer, business or authority records before changing the pack."
        : readiness.stale
          ? "ProfileRelaunch creates a new draft from the current accepted evidence and approves it again."
          : current?.status === "APPROVED" && !current.published
            ? "Send the completed pack. Sending it does not submit anything to Google."
            : current?.status === "DRAFT"
              ? "Approve the completed pack. Sending it comes after approval."
              : readiness.ready
                ? notification.detail
                : "Prepare the submission materials."

  return { headline, detail, packs: display, requirements, notices, who, commands }
}
