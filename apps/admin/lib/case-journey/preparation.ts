/**
 * Guided Step 8 reads the existing prepared-pack records.
 *
 * Completion is the current approved, published, non-empty pack, with no
 * live stale pack. Approval does not publish. Publication does not submit
 * to Google. This module does not create a second pack command.
 */

import type { CaseFlowEvidenceVersionFact, CaseFlowFacts } from "../case-flow/model"
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
  return !!version
    && version.documentId === documentId
    && version.uploadStatus === "UPLOADED"
    && version.scanStatus === "NO_THREATS_FOUND"
    && version.validationStatus === "VALID"
    && version.reviewStatus === "ACCEPTED"
    && !!version.evidenceRequestId
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
  if (input.recordsConflict) notices.push("The customer, business or authority records disagree, so this step does not treat a pack as ready.")

  const source = loaded ?? null
  const display = (source ? source.packs : facts.packs.packs).map(listedPack)
  const live = facts.packs.packs.filter(pack => pack.status !== "SUPERSEDED")
  const current = live.reduce<(typeof live)[number] | null>(
    (best, pack) => (best === null || pack.packNumber > best.packNumber ? pack : best),
    null,
  )
  const stale = live.some(pack => pack.status === "STALE")
  const eligible = loaded ? provenEligible(facts, loaded) : []
  if (loaded && eligible.length !== loaded.eligible.length) {
    notices.push("A listed file is not an accepted, validated, clean version linked to a request. It is not offered for this pack.")
  }

  const commands = loaded && !disagreed
    ? { ...loaded, eligible }
    : null

  const currentPublished = !!current && current.status === "APPROVED" && current.published && current.itemCount > 0 && !stale && !disagreed && !input.recordsConflict
  const headline = disagreed
    ? "Pack records disagree"
    : stale
      ? "Prepared pack is stale"
      : !current
        ? "No prepared pack"
        : current.status === "DRAFT" && current.itemCount === 0
          ? "Prepared pack needs evidence"
          : current.status === "DRAFT"
            ? "Prepared pack needs approval"
            : current.status === "APPROVED" && !current.published
              ? "Prepared pack needs publication"
              : current.status === "APPROVED" && current.published && current.itemCount > 0
                ? input.recordsConflict ? "Pack records disagree" : "Prepared pack is current"
                : "Prepared pack is not ready"

  const detail = "Case preparation is the current approved pack after it has been published. Approval does not publish it. Publication uses the existing customer case-access rule and does not submit anything to Google."

  const requirements: JourneyPreparationRequirement[] = [
    {
      label: "Eligible evidence",
      state: !disagreed && ((current?.itemCount ?? 0) > 0 || eligible.length > 0) ? "Met" : "Not met",
      detail: "Only an accepted, validated, clean file linked to a request can be added. An unscanned, rejected, superseded or unlinked file is not a substitute.",
    },
    {
      label: "Approval",
      state: !disagreed && current?.status === "APPROVED" ? "Met" : "Not met",
      detail: "Approval confirms the selected evidence. It does not publish the pack.",
    },
    {
      label: "Publication",
      state: currentPublished ? "Met" : "Not met",
      detail: "Publication makes the approved pack available through the existing secure case-access link. It does not create an open document link.",
    },
    {
      label: "Current pack",
      state: currentPublished ? "Met" : "Not met",
      detail: stale
        ? "Included evidence changed after approval. The stale pack has to be replaced by a new draft."
        : "The current pack is the latest one that has not been superseded. A superseded pack stays as history.",
    },
  ]

  const who = disagreed
    ? "ProfileRelaunch reconciles the pack records before changing the pack."
    : stale
      ? "ProfileRelaunch creates a new draft from the current accepted evidence and approves it again."
      : current?.status === "APPROVED" && !current.published
        ? "ProfileRelaunch publishes the approved pack. Publication does not submit anything to Google."
        : current?.status === "DRAFT"
          ? "ProfileRelaunch adds accepted evidence and approves the draft. Approval does not publish it."
          : currentPublished
            ? "The published pack is current."
            : "ProfileRelaunch creates a draft pack."

  return { headline, detail, packs: display, requirements, notices, who, commands }
}
