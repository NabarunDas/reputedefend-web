/**
 * Proposed version 2 customer templates.
 *
 * These strings are the source for the unapplied SQL proposal. They are not
 * inserted, approved, or selected. Live drafts keep using the approved
 * version 1 rows until a separate review approves version 2.
 */

export type TemplateProposal = {
  key: "EVIDENCE_REQUEST" | "CASE_UPDATE"
  version: 2
  name: string
  subject: string
  body: string
}

export const evidenceRequestTemplateV2: TemplateProposal = {
  key: "EVIDENCE_REQUEST",
  version: 2,
  name: "Evidence request",
  subject: "Documents for {case_ref}",
  body: [
    "Hello,",
    "Thank you for contacting us about case {case_ref}.",
    "Please send this document:",
    "{specific_document}",
    "We will review what you send. This message does not confirm a Google outcome, a payment, or a time for that review.",
    "The secure upload page below is only for this request.",
    "Kind regards,",
    "ProfileRelaunch",
    "{upload_url}",
  ].join("\n\n"),
}

export const caseUpdateTemplateV2: TemplateProposal = {
  key: "CASE_UPDATE",
  version: 2,
  name: "Case update",
  subject: "An update on {case_ref}",
  body: [
    "Hello,",
    "Here is an update on case {case_ref}.",
    "{fact}",
    "{effect}",
    "What happens next:",
    "{next_step}",
    "Kind regards,",
    "ProfileRelaunch",
  ].join("\n\n"),
}

const placeholders: Record<TemplateProposal["key"], string[]> = {
  EVIDENCE_REQUEST: ["case_ref", "specific_document", "upload_url"],
  CASE_UPDATE: ["case_ref", "fact", "effect", "next_step"],
}

/** Mirrors admin_private.template_text_valid_v1 for the keys this proposal uses. */
export function templateTextValid(key: TemplateProposal["key"], subject: string, body: string): boolean {
  if (subject.trim().length < 1 || subject.trim().length > 200) return false
  if (body.trim().length < 20 || body.trim().length > 5000) return false
  const allowed = placeholders[key]
  const combined = `${subject} ${body}`
  if (allowed.some(name => !combined.includes(`{${name}}`))) return false
  const tokens = [...combined.matchAll(/\{([^{}]+)\}/g)].map(match => match[1] ?? "")
  return tokens.every(token => allowed.includes(token))
}

/** Mirrors admin_private.render_template_v1. Unresolved or empty values fail closed. */
export function renderTemplate(template: string, values: Record<string, string>): string | null {
  if (!template) return null
  let rendered = template
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-z_]+$/.test(key) || value.trim() === "" || /\{[a-z_]+\}/.test(value)) return null
    rendered = rendered.split(`{${key}}`).join(value)
  }
  if (/\{[a-z_]+\}/.test(rendered)) return null
  return rendered
}
