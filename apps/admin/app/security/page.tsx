import { cookies } from "next/headers"
import { requireStaff } from "@/lib/require-staff"
import { backend, ListedSession, tokenHash } from "@/lib/auth/backend"
import { sessionCookie } from "@/lib/auth/config"
import { SignOut } from "../sign-out"
import { RevokeSession } from "../revoke-session"
import { redirect } from "next/navigation"
import { PageHeader } from "../ui"

const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(value))
export const metadata = { title: "Security" }
export default async function SecurityPage() {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const sessions = await backend().rpc<ListedSession[] | null>("admin_list_sessions_v1", { p_token: tokenHash(token) })
  if (sessions === null) redirect("/login")
  return <section className="page">
    <PageHeader title="Security" description="Review this administrator’s sessions. Ending another session still requires a recent sign-in." />
    <section className="panel">
      <p className="eyebrow">Account</p>
      <h2>ProfileRelaunch Administrator</h2>
      <p>This workspace is limited to the registered admin account. The usual Sign out action is also in the header.</p>
      <h2>Active sessions</h2>
      <p className="muted">Times are shown in UK time. Sessions end after 30 minutes of inactivity or 12 hours after sign-in.</p>
      <ul className="sessions">{sessions?.map(session => <li key={session.id}>
        <strong>{session.current ? "This session" : "Another session"}</strong><br />
        Signed in {date(session.createdAt)}<br />Last active {date(session.lastSeenAt)}
        {!session.current && <RevokeSession id={session.id} label={date(session.createdAt)} />}
      </li>)}</ul>
      <p className="muted">Ending another session requires a sign-in from the last five minutes. If asked, sign out and use a new email code.</p>
      <SignOut />
    </section>
  </section>
}
