import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { PageHeader } from "../../ui"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash } from "../../../../../lib/commercial/paid-service-agreement"
import { SolicitorApprovalForm } from "./form"

export const metadata = { title: "Solicitor approval" }

export default async function SolicitorApprovalPage() {
  await requireStaff()
  return <section className="page">
    <PageHeader title="Record solicitor approval" description="Authenticated Admin evidence record for the frozen ProfileRelaunch Ltd paid-service agreement." />
    <p><Link href="/commercial">Back to Commercial</Link></p>
    <section className="panel">
      <p><strong>Version:</strong> {PAID_SERVICE_AGREEMENT_VERSION}</p>
      <p><strong>SHA-256:</strong> <code>{paidServiceAgreementContentHash}</code></p>
      <p>Use this only after checking the original solicitor email approved this exact frozen version and hash. An email subject or owner report alone does not independently verify the wording.</p>
      <p className="muted">The database requires an authenticated Admin session and an auditable evidence reference. This records approval only in the environment you are signed into. DEV and Production databases are separate. No Stripe, Customer Portal, Guard or mail feature is activated here.</p>
      <SolicitorApprovalForm />
    </section>
  </section>
}
