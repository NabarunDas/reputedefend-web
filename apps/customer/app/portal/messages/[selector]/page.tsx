import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isMessageSelector } from "@/lib/portal/messages/parse"
import { loadCustomerMessage } from "@/lib/portal/messages/queries"
import { MessageView, MessagesUnavailable } from "../messages-view"

export const metadata = { title: "Message" }

export default async function MessagePage({ params }: { params: Promise<{ selector: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { selector } = await params
  if (!isMessageSelector(selector)) notFound()
  const loaded = await loadCustomerMessage(selector)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <MessagesUnavailable />
  return <MessageView thread={loaded.thread} />
}
