/**
 * Prepared pack recovery validation.
 *
 * An approved pack is a promise about exactly which document versions were
 * included. After a restore that promise has to still hold: every item must
 * resolve to the same version it was pinned to, with the same metadata, and
 * that version's object must be recoverable.
 *
 * The one thing recovery must never do is quietly repoint an item at the
 * latest version of its document. A pack whose evidence is gone is a
 * non-recoverable pack, and saying so is the correct outcome.
 */

import type { ReconciliationReport } from "./storage"

export type PackItemRecord = {
  packId: string
  itemId: string
  documentId: string
  versionId: string
  position: number
  contentType: string
  sizeBytes: number
}

/** The version a pack item claims, as it exists in the restored database. */
export type PackVersionRecord = {
  versionId: string
  documentId: string
  contentType: string
  sizeBytes: number
  reviewStatus: string
}

export type PackItemOutcome =
  | "RECOVERABLE"
  | "VERSION_MISSING"
  | "VERSION_METADATA_CHANGED"
  | "DOCUMENT_REBOUND"
  | "OBJECT_NOT_RECOVERED"

export type PackItemResult = {
  packId: string
  itemId: string
  versionId: string
  outcome: PackItemOutcome
  detail: string
}

export type PackRecoveryReport = {
  recoverablePacks: readonly string[]
  nonRecoverablePacks: readonly string[]
  items: readonly PackItemResult[]
}

export type PackRecoveryInput = {
  items: readonly PackItemRecord[]
  versions: readonly PackVersionRecord[]
  /** Storage reconciliation for the same restore, used to confirm the bytes exist. */
  storage: ReconciliationReport | null
}

export function validatePackRecovery(input: PackRecoveryInput): PackRecoveryReport {
  const versions = new Map(input.versions.map(version => [version.versionId, version]))
  const recoveredVersionIds = new Set(
    (input.storage?.rows ?? []).filter(row => row.outcome === "MATCHED" && row.versionId).map(row => row.versionId as string),
  )

  const items: PackItemResult[] = input.items.map(item => {
    const version = versions.get(item.versionId)
    if (!version) {
      return {
        packId: item.packId,
        itemId: item.itemId,
        versionId: item.versionId,
        outcome: "VERSION_MISSING",
        detail: "the pinned document version did not come back; the pack cannot be rebuilt as approved",
      }
    }
    if (version.documentId !== item.documentId) {
      return {
        packId: item.packId,
        itemId: item.itemId,
        versionId: item.versionId,
        outcome: "DOCUMENT_REBOUND",
        detail: "the pinned version now belongs to a different document, so the pack no longer means what it meant",
      }
    }
    if (version.contentType !== item.contentType || version.sizeBytes !== item.sizeBytes) {
      return {
        packId: item.packId,
        itemId: item.itemId,
        versionId: item.versionId,
        outcome: "VERSION_METADATA_CHANGED",
        detail: "the restored version metadata differs from the snapshot taken when the item was added",
      }
    }
    if (input.storage && !recoveredVersionIds.has(item.versionId)) {
      return {
        packId: item.packId,
        itemId: item.itemId,
        versionId: item.versionId,
        outcome: "OBJECT_NOT_RECOVERED",
        detail: "the version survived but its evidence object was not confirmed recovered",
      }
    }
    return {
      packId: item.packId,
      itemId: item.itemId,
      versionId: item.versionId,
      outcome: "RECOVERABLE",
      detail: "the item resolves to the same version with the same metadata",
    }
  })

  const packIds = [...new Set(input.items.map(item => item.packId))].sort()
  const nonRecoverablePacks = packIds.filter(packId =>
    items.some(item => item.packId === packId && item.outcome !== "RECOVERABLE"),
  )

  return {
    recoverablePacks: packIds.filter(packId => !nonRecoverablePacks.includes(packId)),
    nonRecoverablePacks,
    items,
  }
}
