import type { CustomerMessageDetail, CustomerMessagePage } from "@/lib/portal/messages/parse"

export function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))
}

export function MessagesUnavailable() {
  return (
    <div className="messages-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Messages</h1>
      <h2>We couldn&apos;t load your messages</h2>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

function place(businessName: string | null, locationName: string | null) {
  if (businessName && locationName) return `${businessName}, ${locationName}`
  return businessName || locationName
}

export function MessagesView({ page, earlier }: { page: CustomerMessagePage; earlier: boolean }) {
  const next = page.nextCursor
  const nextHref = next
    ? `/portal/messages?before=${encodeURIComponent(next.activityAt)}&selector=${encodeURIComponent(next.selector)}`
    : null
  return (
    <div className="messages-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Messages</h1>
      <p className="lead">Messages from ProfileRelaunch about your cases, and email received from the verified email address on your ProfileRelaunch account.</p>
      <p>To reply, use the email ProfileRelaunch sent you. This page does not send messages.</p>
      {page.threads.length === 0 ? (
        earlier ? (
          <>
            <p>No earlier messages.</p>
            <p><a href="/portal/messages">Back to messages</a></p>
          </>
        ) : <p>You don&apos;t have any messages yet.</p>
      ) : (
        <ul className="messages-list">
          {page.threads.map(thread => {
            const where = place(thread.businessName, thread.locationName)
            return (
              <li key={thread.selector}>
                <article className="messages-thread">
                  <h2>{thread.subject}</h2>
                  <p>{thread.state}</p>
                  {thread.caseReference ? <p>Case {thread.caseReference}</p> : null}
                  {where ? <p>{where}</p> : null}
                  <p>{thread.preview}</p>
                  <p><time dateTime={thread.activityAt}>{formatMessageTime(thread.activityAt)}</time></p>
                  <p><a href={`/portal/messages/${thread.selector}`}>View conversation</a></p>
                </article>
              </li>
            )
          })}
        </ul>
      )}
      {!page.complete && nextHref ? (
        <>
          <p>Older messages are not shown on this page.</p>
          <p className="case-pagination"><a href={nextHref}>Earlier messages</a></p>
        </>
      ) : null}
    </div>
  )
}

export function MessageView({ thread }: { thread: CustomerMessageDetail }) {
  const where = place(thread.businessName, thread.locationName)
  return (
    <div className="messages-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <p><a href="/portal/messages">All messages</a></p>
      <h1>{thread.subject}</h1>
      <p>{thread.state}</p>
      {thread.caseReference ? <p>Case {thread.caseReference}</p> : null}
      {where ? <p>{where}</p> : null}
      <ol className="message-entries">
        {thread.entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <article className="message-entry">
              <h2>{entry.role}</h2>
              <p><time dateTime={entry.at}>{formatMessageTime(entry.at)}</time></p>
              {entry.subject ? <p>{entry.subject}</p> : null}
              <p className="preserve-lines">{entry.body}</p>
              {entry.delivery ? <p>{entry.delivery}</p> : null}
            </article>
          </li>
        ))}
      </ol>
      {!thread.complete ? <p>Earlier messages in this conversation are not shown here.</p> : null}
    </div>
  )
}
