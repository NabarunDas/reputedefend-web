import type { PackOperation } from "./model"

export const PACK_PUBLISH_WILL_SHARE =
  "Publishing makes these exact files available in the customer portal. Staff do not mark each file visible separately."

export const PACK_PUBLISH_ELIGIBILITY_UNKNOWN =
  "Eligibility could not be confirmed. Reload the case and read the pack status before publishing."

export const PACK_COMMAND_UNCERTAIN =
  "The result of this pack action is uncertain. Reload the case and read the pack status before doing anything else. Do not submit it again until you have checked."

export const PACK_COMMAND_CONFLICT =
  "That pack record changed or is no longer available. Reload the case and read the pack status before doing anything else. Do not submit this action again until you have checked."

const held = " Nothing was made visible and the pack was not published."

export function packPublicationBlockMessage(reason: string): string {
  switch (reason) {
    case "version":
      return "A listed file is not a clean, accepted version. Nothing will be published. Prepare a replacement draft."
    case "document":
      return "A listed file does not belong to this case, or the pack lists two versions of one document. Nothing will be published."
    case "status":
      return "This pack is not the current approved pack. Nothing will be published."
    case "empty":
      return "This pack has no files. Nothing will be published."
    case "role":
    case "deliverable":
    case "instructions":
    case "author":
    case "evidence":
      return "This Guided pack is missing the required statement or instructions. Nothing will be published. Prepare a replacement draft."
    case "unpaid":
    case "receipt":
    case "refunded":
      return "This Guided pack cannot be published until the upfront payment is settled and the receipt is on the case."
    case "authority":
      return "This Guided pack cannot be published until the customer's authority is verified."
    case "order":
      return "This Guided pack cannot be published until the accepted Guided order matches this case."
    case "pack":
      return "That pack could not be confirmed. Nothing will be published."
    default:
      return "This pack cannot be published. Prepare a replacement draft. Do not change file visibility by hand."
  }
}

export function packApproveDeniedMessage(reason?: string): string {
  switch (reason) {
    case "deliverable":
      return "This Guided pack needs exactly one completed statement. Nothing was approved."
    case "instructions":
      return "This Guided pack needs exactly one customer submission instructions document. Nothing was approved."
    case "role":
      return "Every file in this Guided pack needs a role. Nothing was approved."
    case "document":
      return "The completed statement and the customer instructions must be different documents. Nothing was approved."
    case "author":
      return "The completed statement and the customer instructions must be staff-authored files on this case. Nothing was approved."
    case "evidence":
      return "Supporting evidence must belong to this case. Nothing was approved."
    case "empty":
      return "This pack has no files. Nothing was approved."
    case "version":
      return "A listed file is not a clean, accepted version. Nothing was approved."
    default:
      return "That action is not allowed for this pack."
  }
}

export function packDeniedMessage(operation: PackOperation, reason?: string): string {
  if (operation === "approve") return packApproveDeniedMessage(reason)
  if (operation === "send_pack_email") {
    if (reason === "unpaid" || reason === "receipt" || reason === "refunded") return "This Guided pack cannot be sent until the upfront payment is settled and the receipt is on the case."
    if (reason === "authority") return "This Guided pack cannot be sent until the customer's authority is verified."
    if (reason === "order") return "This Guided pack cannot be sent until the accepted Guided order matches this case."
    return "This pack is not ready for a customer notification. No email was queued."
  }
  if (operation !== "publish") return "That action is not allowed for this pack."
  switch (reason) {
    case "version":
      return `A listed file is not a clean, accepted version.${held} Prepare a replacement draft.`
    case "document":
      return `A listed file does not belong to this case, or the pack lists two versions of one document.${held}`
    case "status":
      return `This pack is not the current approved pack.${held}`
    case "empty":
      return `This pack has no files.${held}`
    case "role":
    case "deliverable":
    case "instructions":
    case "author":
    case "evidence":
      return `This Guided pack is missing the required statement or instructions.${held} Prepare a replacement draft.`
    case "unpaid":
    case "receipt":
    case "refunded":
      return `This Guided pack cannot be published until the upfront payment is settled and the receipt is on the case.${held}`
    case "authority":
      return `This Guided pack cannot be published until the customer's authority is verified.${held}`
    case "order":
      return `This Guided pack cannot be published until the accepted Guided order matches this case.${held}`
    case "pack":
      return `That pack could not be confirmed.${held}`
    default:
      return reason
        ? `This pack cannot be published.${held} Prepare a replacement draft. Do not change file visibility by hand.`
        : `That pack cannot be published.${held}`
  }
}
