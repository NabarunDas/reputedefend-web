import { cookies } from "next/headers"
import { requireStaff } from "@/lib/require-staff"
import { backend, ListedSession, tokenHash } from "@/lib/auth/backend"
import { sessionCookie } from "@/lib/auth/config"
import { SignOut } from "./sign-out"

const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(value))
export default async function AdminHome() {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const sessions = await backend().rpc<ListedSession[] | null>("admin_list_sessions_v1", { p_token: tokenHash(token) })
  return <section className="panel">
    <p className="eyebrow">ProfileRelaunch Admin</p>
    <h1>You’re signed in</h1>
    <p>Signed in as <strong>admin@profilerelaunch.com</strong>.</p>
    <p>Your admin access is ready. Client management, enquiries and payments will be added in the next implementation stages.</p>
    <h2>Active sessions</h2>
    <p className="muted">Times are shown in UK time. Sessions end after 30 minutes of inactivity or 12 hours after sign-in.</p>
    <ul className="sessions">{sessions?.map(session => <li key={session.id}>
      <strong>{session.current ? "This session" : "Another session"}</strong><br />
      Signed in {date(session.createdAt)}<br />Last active {date(session.lastSeenAt)}
    </li>)}</ul>
    <SignOut />
  </section>
}
