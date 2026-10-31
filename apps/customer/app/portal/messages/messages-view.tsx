"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { formatPortalDateTime } from "@/lib/portal/cases/model"
import {
  groupCustomerMessages,
  isMessagesReturnHref,
  messageCountLabel,
  messageParagraphs,
  messageTextParts,
  messageTitle,
  messagesArePartial,
  messagesReturnHref,
  MESSAGES_RETURN_KEY,
} from "@/lib/portal/messages/present"
import type { CustomerMessageDetail, CustomerMessagePage, CustomerMessageThread } from "@/lib/portal/messages/parse"

function MessageText({ text }: { text: string }) {
  const parts = messageTextParts(text)
  return (
    <>
      {parts.map((part, index) => part.type === "link"
        ? <a key={index} href={part.href}>{part.href}</a>
        : <span key={index}>{part.value}</span>)}
    </>
  )
}

function MessageBody({ body }: { body: string }) {
  return (
    <div className="message-body message-reading">
      {messageParagraphs(body).map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex} className="preserve-lines"><MessageText text={paragraph} /></p>
      ))}
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

function rememberReturn(search: string, groupId: string) {
  const href = messagesReturnHref(search, groupId)
  if (!href) return
  try {
    sessionStorage.setItem(MESSAGES_RETURN_KEY, href)
  } catch {
    // Private browsing can refuse storage. The case hash on the first page still works.
  }
}

function useMessagesReturn(fallback: string) {
  return useSyncExternalStore(
    onStoreChange => {
      window.addEventListener("storage", onStoreChange)
      return () => window.removeEventListener("storage", onStoreChange)
    },
    () => {
      try {
        const stored = sessionStorage.getItem(MESSAGES_RETURN_KEY)
        return stored && isMessagesReturnHref(stored) ? stored : fallback
      } catch {
        return fallback
      }
    },
    () => fallback,
  )
}

function useMessageHash() {
  return useSyncExternalStore(
    onStoreChange => {
      window.addEventListener("hashchange", onStoreChange)
      return () => window.removeEventListener("hashchange", onStoreChange)
    },
    () => window.location.hash.replace(/^#/, ""),
    () => "",
  )
}

export function MessagesView({ page, earlier }: { page: CustomerMessagePage; earlier: boolean }) {
  const groups = groupCustomerMessages(page.threads)
  const partial = messagesArePartial({ earlier, complete: page.complete })
  const hashId = useMessageHash()
  const hashMatch = hashId && groups.some(group => group.id === hashId) ? hashId : null
  const [chosen, setChosen] = useState<string[] | null>(null)
  const openIds = chosen ?? (hashMatch ? [hashMatch] : groups[0] ? [groups[0].id] : [])
  useEffect(() => {
    if (!hashMatch) return
    try {
      document.getElementById(hashMatch)?.scrollIntoView({ block: "nearest" })
    } catch {
      // The group stays expanded when the page cannot scroll.
    }
  }, [hashMatch])
  const next = page.nextCursor
  const nextHref = next
    ? `/portal/messages?before=${encodeURIComponent(next.activityAt)}&selector=${encodeURIComponent(next.selector)}`
    : null
  return (
    <div className="messages-page">
      <h1>Messages</h1>
      <p className="lead">Updates for your cases, with the latest activity first.</p>
      {groups.length === 0 ? (
        earlier ? (
          <div className="state-panel messages-empty">
            <p>No earlier messages.</p>
            <p><a href="/portal/messages">Back to messages</a></p>
          </div>
        ) : <p className="state-panel messages-empty">You don&apos;t have any messages yet.</p>
      ) : (
        <ul className="message-groups" aria-label="Messages by case">
          {groups.map(group => {
            const open = openIds.includes(group.id)
            const panelId = `${group.id}-messages`
            const count = messageCountLabel(group.threads.length, partial)
            return (
              <li key={group.id} id={group.id} className="message-group">
                <h2 className="message-group-heading">
                  <button
                    type="button"
                    className="message-group-toggle"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setChosen(current => {
                      const base = current ?? openIds
                      return base.includes(group.id) ? base.filter(id => id !== group.id) : [...base, group.id]
                    })}
                  >
                    <span className="message-group-chevron" aria-hidden="true" />
                    <span className="message-group-copy">
                      <span className="message-group-title">{group.label}</span>
                      {group.businessName ? <span className="message-group-business">{group.businessName}</span> : null}
                      <span className="message-group-meta">
                        <span>{count}</span>
                        <time dateTime={group.latestActivityAt}>{formatMessageTime(group.latestActivityAt)}</time>
                      </span>
                    </span>
                  </button>
                </h2>
                <ul id={panelId} className="message-group-list" hidden={!open}>
                  {group.threads.map(thread => {
                    const title = messageTitle(thread.subject)
                    return (
                      <li key={thread.selector}>
                        <a
                          className="message-row"
                          href={`/portal/messages/${thread.selector}`}
                          onClick={() => rememberReturn(window.location.search, group.id)}
                        >
                          <span className="message-row-title">{title}</span>
                          <time dateTime={thread.activityAt}>{formatMessageTime(thread.activityAt)}</time>
                          <span className="message-row-action">
                            View message
                            <span className="message-chevron" aria-hidden="true">›</span>
                          </span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
      {earlier && groups.length > 0 ? (
        <p className="case-pagination"><a href="/portal/messages">Back to latest messages</a></p>
      ) : null}
      {!page.complete && nextHref ? (
        <>
          <p>Older messages are not shown on this page.</p>
          <p className="case-pagination"><a href={nextHref}>Earlier messages</a></p>
        </>
      ) : null}
      {partial && groups.length > 0 ? (
        <p className="message-page-note">Counts are for the messages on this page.</p>
      ) : null}
    </div>
  )
}

export function MessageView({ thread }: { thread: CustomerMessageDetail }) {
  const title = messageTitle(thread.subject)
  const where = context(thread)
  const group = groupCustomerMessages([thread])[0]
  const back = useMessagesReturn(group ? `/portal/messages#${group.id}` : "/portal/messages")
  return (
    <div className="messages-page">
      <p><a href={back}>Back to messages</a></p>
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
