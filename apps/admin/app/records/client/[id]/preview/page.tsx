import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { isUuid, recordPath } from "@/lib/records/model"
import { loadCustomerPreview } from "@/lib/reports/queries"
import { EmptyState, PageHeader } from "../../../../ui"

export const metadata = { title: "Customer-visible preview" }

export default async function CustomerPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const data = await loadCustomerPreview(id) as {
    status?: string
    customer?: { fullName?: string; email?: string | null; emailVerified?: boolean }
    memberships?: Array<{ businessId: string; businessName: string }>
    locations?: Array<{ id: string; name: string }>
    cases?: Array<{ id: string; reference: string; type: string; status: string; notes?: string[] }>
    evidenceRequests?: Array<{ id: string; title: string; status: string }>
    visibleDocuments?: Array<{ title: string; filename: string }>
    orders?: Array<{ reference: string; serviceCode: string; amountMinor: number; currency: string }>
  }
  if (data.status === "denied" || data.status === "invalid") notFound()
  return <section className="page">
    <Link className="back-link" href={recordPath("client", id)}>Back to client record</Link>
    <PageHeader title="Customer-visible preview" description="Read-only projection of information already shown to this customer. This is not an impersonation session and does not issue OTP." />
    <section className="panel">
      <h2>{data.customer?.fullName}</h2>
      <p>{data.customer?.emailVerified ? data.customer.email : "No currently verified email is shown to the customer."}</p>
    </section>
    <section className="panel">
      <h2>Verified businesses and locations</h2>
      {!data.memberships?.length ? <EmptyState>No verified memberships.</EmptyState> : <ul>{data.memberships.map(item => <li key={item.businessId}>{item.businessName}</li>)}</ul>}
      {!!data.locations?.length && <ul>{data.locations.map(item => <li key={item.id}>{item.name}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Cases</h2>
      {!data.cases?.length ? <EmptyState>No cases.</EmptyState> : data.cases.map(item => <article key={item.id}><h3>{item.reference}</h3><p>{item.type} · {item.status}</p>{!!item.notes?.length && <ul>{item.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}</article>)}
    </section>
    <section className="panel">
      <h2>Open evidence requests</h2>
      {!data.evidenceRequests?.length ? <EmptyState>No open customer evidence requests.</EmptyState> : <ul>{data.evidenceRequests.map(item => <li key={item.id}>{item.title} · {item.status}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Customer-visible documents</h2>
      {!data.visibleDocuments?.length ? <EmptyState>No published customer-visible documents.</EmptyState> : <ul>{data.visibleDocuments.map(item => <li key={item.filename}>{item.title} · {item.filename}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Accepted orders</h2>
      {!data.orders?.length ? <EmptyState>No accepted orders.</EmptyState> : <ul>{data.orders.map(item => <li key={item.reference}>{item.reference} · {item.serviceCode} · {(item.amountMinor / 100).toFixed(2)} {item.currency}</li>)}</ul>}
    </section>
  </section>
}
