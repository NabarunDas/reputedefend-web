import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { PhoneEnquiryForm } from "../forms"
import { PageHeader } from "../../ui"

export const metadata = { title: "Record a phone enquiry" }
export default async function NewEnquiry() {
  await requireStaff()
  return <section className="page">
    <Link className="back-link" href="/enquiries">Back to enquiries</Link>
    <PageHeader title="Record a phone enquiry" description="This form does not send email or create a client account." />
    <section className="panel"><PhoneEnquiryForm /></section>
  </section>
}
