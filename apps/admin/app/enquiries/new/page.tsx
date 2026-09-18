import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { AdminNav } from "../../admin-nav"
import { PhoneEnquiryForm } from "../forms"
export default async function NewEnquiry(){await requireStaff();return <section className="panel"><AdminNav current="enquiries"/><Link href="/enquiries">Back to enquiries</Link><h1>Record a phone enquiry</h1><PhoneEnquiryForm/></section>}
