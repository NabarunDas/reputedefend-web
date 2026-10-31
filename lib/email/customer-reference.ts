/**
 * Customer-facing reference wording.
 * Case references stay the primary identifier. Quotation, service-order and
 * receipt numbers stay labelled secondary records. This module does not
 * allocate a reference.
 */

const caseRefPattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/

export function customerCaseSubject(title: string, caseRef: string): string {
  return `${title.trim()} — Case ${caseRef.trim()}`
}

export function quotationNumberLine(publicRef: string): string {
  return `Quotation number: ${publicRef.trim()}`
}

export function serviceOrderLine(orderRef: string): string {
  return `Service order: ${orderRef.trim()}`
}

export function receiptNumberLine(receiptRef: string): string {
  return `Receipt number: ${receiptRef.trim()}`
}

/** A real case reference, as stored on the case. Preview fixtures may be shorter. */
export function strictCaseReference(value: string): boolean {
  return caseRefPattern.test(value.trim())
}
