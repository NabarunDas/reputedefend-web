/**
 * ZIP entry names are derived only from the original filename.
 * Storage keys, selectors and provider ids never become entry names.
 */
const CONTROL = /[\u0000-\u001f\u007f]/g

export function submissionPackFilename(reference: string): string {
  return `ProfileRelaunch_${reference}_Submission_Pack.zip`
}

export function archiveEntryName(filename: string, used: Set<string>): string | null {
  const base = safeBasename(filename)
  if (!base) return null
  let name = base
  let copy = 2
  while (used.has(name.toLocaleLowerCase("en-GB"))) {
    const dot = base.lastIndexOf(".")
    const stem = dot > 0 ? base.slice(0, dot) : base
    const extension = dot > 0 ? base.slice(dot) : ""
    name = `${stem} (${copy})${extension}`
    copy += 1
    if (copy > 100 || name.length > 180) return null
  }
  used.add(name.toLocaleLowerCase("en-GB"))
  return name
}

function safeBasename(filename: string): string | null {
  const trimmed = filename.trim()
  if (!trimmed || trimmed.length > 255) return null
  const base = trimmed.split(/[/\\]/).pop() ?? ""
  const cleaned = base.replace(CONTROL, "").replace(/^\.+/, "").trim()
  if (!cleaned || cleaned === "." || cleaned === ".." || cleaned.includes("..")) return null
  if (/[/\\]/.test(cleaned)) return null
  return cleaned.slice(0, 150)
}
