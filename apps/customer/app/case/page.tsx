import { ACTION_UNAVAILABLE } from "@/lib/access"
import { getCustomerCasePack } from "@/lib/case/queries"
import { CaseClient } from "./case-client"

export const metadata = { title: "Case documents" }

export default async function CasePage() {
  const data = await getCustomerCasePack()
  if ("unavailable" in data) {
    return <section><h1>Case documents</h1><p>{ACTION_UNAVAILABLE}</p></section>
  }
  return <CaseClient data={data} />
}
