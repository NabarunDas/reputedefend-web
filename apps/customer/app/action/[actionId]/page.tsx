import { ActionClient } from "./action-client"

export const metadata = { title: "Secure action" }
export default async function ActionPage({ params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params
  return <ActionClient actionId={actionId} />
}
