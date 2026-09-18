import { isUuid } from "../records/model"
import { packOperations, type PackOperation } from "./model"

export type PackCreateArgs = { caseId: string }
export type PackItemArgs = { caseId: string; packId: string; recordVersion: number; versionId: string }
export type PackMoveArgs = PackItemArgs & { direction: "up" | "down" }
export type PackApproveArgs = { caseId: string; packId: string; recordVersion: number; note: string; confirmed: true }
export type PackArgs = PackCreateArgs | PackItemArgs | PackMoveArgs | PackApproveArgs

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every(key => allowed.includes(key))
}

function note(value: unknown): string | null {
  return typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 2000 ? value.trim() : null
}

export function packArgs(operation: PackOperation, raw: unknown): PackArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation || !packOperations.includes(operation)) return null
  if (operation === "create") {
    if (!onlyKeys(body, ["operation", "caseId"]) || !isUuid(body.caseId)) return null
    return { caseId: body.caseId }
  }
  if (!isUuid(body.caseId) || !isUuid(body.packId) || !Number.isSafeInteger(body.recordVersion) || (body.recordVersion as number) < 1) return null
  if (operation === "approve") {
    if (!onlyKeys(body, ["operation", "caseId", "packId", "recordVersion", "note", "confirmed"])) return null
    const supporting = note(body.note)
    if (!supporting || body.confirmed !== true) return null
    return { caseId: body.caseId, packId: body.packId, recordVersion: body.recordVersion as number, note: supporting, confirmed: true }
  }
  if (!isUuid(body.versionId)) return null
  if (operation === "move_item") {
    if (!onlyKeys(body, ["operation", "caseId", "packId", "recordVersion", "versionId", "direction"])) return null
    if (body.direction !== "up" && body.direction !== "down") return null
    return { caseId: body.caseId, packId: body.packId, recordVersion: body.recordVersion as number, versionId: body.versionId, direction: body.direction }
  }
  if (!onlyKeys(body, ["operation", "caseId", "packId", "recordVersion", "versionId"])) return null
  return { caseId: body.caseId, packId: body.packId, recordVersion: body.recordVersion as number, versionId: body.versionId }
}

export function isPackCreateArgs(args: PackArgs): args is PackCreateArgs {
  return !("packId" in args)
}
export function isPackApproveArgs(args: PackArgs): args is PackApproveArgs {
  return "confirmed" in args
}
export function isPackMoveArgs(args: PackArgs): args is PackMoveArgs {
  return "direction" in args
}
export function isPackItemArgs(args: PackArgs): args is PackItemArgs {
  return "versionId" in args && !("direction" in args)
}
