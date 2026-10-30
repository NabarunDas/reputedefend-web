"use client"

import { useId, useState } from "react"
import { formatPortalDateTime } from "@/lib/portal/cases/model"
import { messageIsLong, messageParagraphs, messagePreview, messageTitle } from "@/lib/portal/messages/present"
import type { CustomerMessageDetail, CustomerMessagePage, CustomerMessageThread } from "@/lib/portal/messages/parse"

function MessageBody({ body }: { body: string }) {
  const paragraphs = messageParagraphs(body)
  const long = messageIsLong(body)
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  if (!long) {
    return (
      <div className="message-body message-reading">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p key={paragraphIndex} className="preserve-lines">{paragraph}</p>
        ))}
      </div>
    )
  }
  return (
    <div className="message-body message-reading">
      <div id={bodyId} className="preserve-lines">{expanded ? body : messagePreview(body)}</div>
      <button
        type="button"
        className="message-disclosure"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(open => !open)}
      >
        {expanded ? "Collapse message" : "Expand message"}
      </button>
    </div>
  )
}

export function formatMessageTime(value: string) {
  return formatPortalDateTime(value)
}

export function MessagesUnavailable() {
  return (
    <div className="messages-page state-panel">
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

function context(thread: CustomerMessageThread) {
  const where = place(thread.businessName, thread.locationName)
  return [where, thread.caseReference ? `Case ${thread.caseReference}` : null].filter(Boolean).join(" · ")
}

export function MessagesView({ page, earlier }: { page: CustomerMessagePage; earlier: boolean }) {
  const next = page.nextCursor
  const nextHref = next
    ? `/portal/messages?before=${encodeURIComponent(next.activityAt)}&selector=${encodeURIComponent(next.selector)}`
    : null
  return (
    <div className="messages-page">
      <h1>Messages</h1>
      <p className="lead">Updates about your cases, kept in the order they were recorded.</p>
      {page.threads.length === 0 ? (
        earlier ? (
          <div className="state-panel messages-empty">
            <p>No earlier messages.</p>
            <p><a href="/portal/messages">Back to messages</a></p>
          </div>
        ) : <p className="state-panel messages-empty">You don&apos;t have any messages yet.</p>
      ) : (
        <ul className="messages-list" aria-label="Message list">
          {page.threads.map(thread => {
            const title = messageTitle(thread.subject)
            const where = context(thread)
            const href = `/portal/messages/${thread.selector}`
            return (
              <li key={thread.selector}>
                <a className="message-row" href={href}>
                  <span className="message-row-main">
                    <span className="message-row-title">{title}</span>
                    {where ? <span className="message-row-context">{where}</span> : null}
                    {thread.preview ? <span className="message-row-preview">{thread.preview}</span> : null}
                    <span className="message-row-action">
                      View message
                      <span className="message-chevron" aria-hidden="true">›</span>
                    </span>
                  </span>
                  <time dateTime={thread.activityAt}>{formatMessageTime(thread.activityAt)}</time>
                </a>
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
  const title = messageTitle(thread.subject)
  const where = context(thread)
  return (
    <div className="messages-page">
      <p><a href="/portal/messages">All messages</a></p>
      <h1>{title}</h1>
      <p className="message-state">{thread.state}</p>
      {where ? <p>{where}</p> : null}
      {title !== thread.subject ? (
        <dl className="message-recorded">
          <div>
            <dt>Recorded subject</dt>
            <dd>{thread.subject}</dd>
          </div>
        </dl>
      ) : null}
      <ol className="message-entries">
        {thread.entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <article className={`message-entry ${entry.role === "ProfileRelaunch" ? "message-entry-team" : "message-entry-customer"}`}>
              <h2>{entry.role}</h2>
              <p><time dateTime={entry.at}>{formatMessageTime(entry.at)}</time></p>
              {entry.subject && entry.subject !== thread.subject ? <p>{entry.subject}</p> : null}
              <MessageBody body={entry.body} />
              {entry.delivery ? <p className="message-delivery">{entry.delivery}</p> : null}
            </article>
          </li>
        ))}
      </ol>
      <p className="message-reply">To reply, use the email ProfileRelaunch sent you.</p>
      {!thread.complete ? <p>Earlier messages in this conversation are not shown here.</p> : null}
    </div>
  )
}
