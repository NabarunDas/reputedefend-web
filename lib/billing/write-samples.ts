import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { buildBillingPdf } from "./document-pdf"
import { buildBillingDocument, sellerFromLegalIdentity } from "./document"
import { creditNoteDocument, invoiceDocument, paymentReceiptDocument, quotationDocument } from "./recorded"

const logo = readFileSync(new URL("../../apps/customer/public/brand/profile-relaunch-logo.png", import.meta.url))
const issued = "2026-10-26T18:04:00.000Z"
const seller = sellerFromLegalIdentity()
const billTo = {
  name: "Synthetic Purchasing Business Ltd",
  email: "accounts@example.com",
  countryCode: "GB",
  contactName: "Alex Customer",
}

function write(name: string, document: NonNullable<ReturnType<typeof paymentReceiptDocument>>) {
  writeFileSync(new URL(`../../docs/billing/samples/${name}.pdf`, import.meta.url), buildBillingPdf(document, logo))
}

mkdirSync(new URL("../../docs/billing/samples/", import.meta.url), { recursive: true })

write("guided-relaunch", paymentReceiptDocument({
  state: "PAID", reference: "RC-26-GRLNCH", issuedOn: issued, serviceName: "Guided Relaunch",
  amountMinor: 9900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  paymentModel: "UPFRONT", orderReference: "SO-26-GRLNCH", caseReference: "PR-26-GRLNCH",
  paymentMethod: "Card payment through Stripe", billTo, seller,
})!)
write("guided-review", paymentReceiptDocument({
  state: "PAID", reference: "RC-26-GRVWAA", issuedOn: issued, serviceName: "Guided Review",
  amountMinor: 5900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  paymentModel: "UPFRONT", orderReference: "SO-26-GRVWAA", caseReference: "RV-26-GRVWAA",
  paymentMethod: "Card payment through Stripe", billTo, seller,
})!)
write("managed-profile-recovery", paymentReceiptDocument({
  state: "PAID", reference: "RC-26-MPRCVY", issuedOn: issued, serviceName: "Managed Profile Recovery",
  amountMinor: 29900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  paymentModel: "SUCCESS_FEE", orderReference: "SO-26-MPRCVY", caseReference: "PR-26-MPRCVY",
  paymentMethod: "Card payment through Stripe", billTo, seller,
})!)
write("managed-review-protection", paymentReceiptDocument({
  state: "PAID", reference: "RC-26-MRPROT", issuedOn: issued, serviceName: "Managed Review Protection",
  amountMinor: 14900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  paymentModel: "SUCCESS_FEE", orderReference: "SO-26-MRPROT", caseReference: "RV-26-MRPROT",
  paymentMethod: "Card payment through Stripe", billTo, seller,
})!)
write("relaunch-guard", paymentReceiptDocument({
  state: "PAID", reference: "RG-26-GUARDX", issuedOn: issued, serviceName: "Relaunch Guard",
  amountMinor: 999, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  paymentModel: "RECURRING_MONTHLY", orderReference: "SO-26-GUARDX", caseReference: "PR-26-GUARDX",
  paymentMethod: "Card payment through Stripe", billTo, seller,
  periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z",
  coveredLocation: "High Street", paymentSettled: true,
})!)
write("quotation", quotationDocument({
  reference: "QT-26-OFFER1", issuedOn: issued, serviceName: "Guided Relaunch", currency: "GBP",
  taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0, totalMinor: 9900, standardAmountMinor: 9900,
  discountAmountMinor: 0, quotedSubtotalMinor: 9900, billTo, seller, caseReference: "PR-26-GRLNCH",
  validUntil: "2026-11-26T00:00:00.000Z", paymentModel: "UPFRONT",
}))
write("invoice", invoiceDocument({
  state: "ISSUED", reference: "IN-26-DUE001", issuedOn: issued, serviceName: "Managed Profile Recovery",
  amountMinor: 29900, currency: "GBP", taxBehaviour: "NOT_APPLICABLE", taxAmountMinor: 0,
  billTo, seller, orderReference: "SO-26-MPRCVY", caseReference: "PR-26-MPRCVY",
})!)
write("credit-note", creditNoteDocument({
  state: "SUCCEEDED", reference: "CN-26-CREDIT", issuedOn: "2026-10-27T09:00:00.000Z",
  serviceName: "Relaunch Guard", amountMinor: 999, currency: "GBP", billTo, seller,
  originalReference: "RG-26-GUARDX", orderReference: "SO-26-GUARDX",
  periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z",
})!)
writeFileSync(new URL("../../docs/billing/samples/international-buyer.pdf", import.meta.url), buildBillingPdf(buildBillingDocument({
  kind: "receipt",
  reference: "RC-26-INTL01",
  issuedOn: issued,
  currency: "GBP",
  seller,
  billTo: {
    name: "নীল রায়",
    lines: ["राज कुमार", "Αθήνα", "王伟"],
    email: "accounts@example.com",
  },
  lines: [{ description: "Guided Relaunch", quantity: 1, unitAmountMinor: 9900 }],
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: 0,
  totalMinor: 9900,
  details: [{ label: "Receipt number", value: "RC-26-INTL01" }],
}), logo))
writeFileSync(new URL("../../docs/billing/samples/long-invoice.pdf", import.meta.url), buildBillingPdf(buildBillingDocument({
  kind: "invoice",
  reference: "IN-26-LONG01",
  issuedOn: issued,
  currency: "GBP",
  seller,
  billTo: {
    name: "Long Detail Purchasing Limited and Associated International Holdings",
    lines: ["Accounts payable, fourth floor, a very long registered trading address that must wrap inside the bill-to panel"],
    email: "accounts.payable.international@example.com",
  },
  lines: Array.from({ length: 28 }, (_, index) => ({
    description: `Service line ${index + 1} with a description long enough to wrap inside the table`,
    quantity: 1,
    unitAmountMinor: 100,
  })),
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: 0,
  totalMinor: 2800,
  details: [{ label: "Narrative", value: "Warehouse ".repeat(40).trim() }],
}), logo))
