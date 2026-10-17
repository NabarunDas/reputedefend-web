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
  subject: "Supporting information for your enquiry — {case_ref}",
  body: [
    "Hello,",
    "Thank you for contacting ProfileRelaunch about your Google Business Profile.",
    "We're reviewing your enquiry, reference {case_ref}. To help us understand the issue and advise you on the next steps, could you please provide the following supporting information?",
    "{specific_document}",
    "Please upload the requested information using the secure link at the end of this email.",
    "If you're unsure what to provide, you can contact our team through the ProfileRelaunch website.",
    "For your security, please never share passwords, verification codes or sign-in credentials.",
    "Kind regards,",
    "ProfileRelaunch Support Team",
    "Secure document-upload link:",
    "{upload_url}",
  ].join("\n\n"),
}

export const caseUpdateTemplateV2: TemplateProposal = {
  key: "CASE_UPDATE",
  version: 2,
  name: "Case update",
  subject: "An update on your enquiry — {case_ref}",
  body: [
    "Hello,",
    "Here is an update on your enquiry, reference {case_ref}.",
    "{fact}",
    "{effect}",
    "What happens next:",
    "{next_step}",
    "Kind regards,",
    "ProfileRelaunch Support Team",
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
