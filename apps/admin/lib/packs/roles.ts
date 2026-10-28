import type { PreparedPack, PreparedPackItem } from "./model"

export function packRoleLabel(role: PreparedPackItem["role"]): string | null {
  if (role === "DELIVERABLE") return "Completed statement"
  if (role === "EVIDENCE") return "Supporting evidence"
  if (role === "INSTRUCTIONS") return "Customer submission instructions"
  return null
}

/** Exact Guided role gaps. An empty list means the counts are ready to submit for a server check. */
export function guidedPackRoleMessages(items: Pick<PreparedPackItem, "role">[]): string[] {
  const deliverables = items.filter(item => item.role === "DELIVERABLE").length
  const instructions = items.filter(item => item.role === "INSTRUCTIONS").length
  const untagged = items.filter(item => item.role !== "DELIVERABLE" && item.role !== "EVIDENCE" && item.role !== "INSTRUCTIONS").length
  const messages: string[] = []
  if (deliverables !== 1) messages.push(`${deliverables} completed statement${deliverables === 1 ? "" : "s"}; exactly 1 required`)
  if (instructions !== 1) messages.push(`${instructions} customer submission instruction${instructions === 1 ? "" : "s"}; exactly 1 required`)
  if (untagged > 0) messages.push(`${untagged} file${untagged === 1 ? " has" : "s have"} no role`)
  return messages
}

/**
 * The same pack Step 8 treats as current: the highest pack number that has
 * not been superseded. A newer stale pack stays current. A superseded pack
 * is current only when every pack has been superseded.
 */
export function currentWorkingPack(packs: PreparedPack[]): PreparedPack | null {
  const ranked = [...packs].sort((left, right) => right.packNumber - left.packNumber || right.createdAt.localeCompare(left.createdAt))
  return ranked.find(pack => pack.status !== "SUPERSEDED") ?? ranked[0] ?? null
}
