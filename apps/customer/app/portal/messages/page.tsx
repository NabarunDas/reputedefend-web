import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { parseMessagesRequest } from "@/lib/portal/messages/parse"
import { loadCustomerMessages } from "@/lib/portal/messages/queries"
import { MessagesUnavailable, MessagesView } from "./messages-view"

export const metadata = { title: "Messages" }

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!portalAvailable()) redirect("/")
  const query = parseMessagesRequest(await searchParams)
  if (!query) notFound()
  const loaded = await loadCustomerMessages(query)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <MessagesUnavailable />
  return <MessagesView page={loaded.page} earlier={query.before !== null} />
}
