import { commercialBeginSetupEnabled } from "@/lib/commercial/begin-setup-flag"
import { commercialConfirmAiConfigurationEnabled } from "@/lib/commercial/confirm-ai-configuration-flag"
import { commercialRecordNumberAllocationEnabled } from "@/lib/commercial/record-number-allocation-flag"
import { commercialRecordForwardingInstructionsEnabled } from "@/lib/commercial/record-forwarding-instructions-flag"
import { commercialProviderLane } from "@/lib/commercial/provider-lane"
import { commercialConfirmPreferencesEnabled } from "@/lib/commercial/confirm-preferences-flag"
import { commercialSetupQueueEnabled } from "@/lib/commercial/setup-queue-flag"
import { loadSetupQueue } from "@/lib/commercial/setup-queue"
import { requireStaff } from "@/lib/require-staff"
import { Notice, PageHeader } from "../../ui"
import { SetupQueueView } from "./setup-queue-view"

export const metadata = { title: "Paid setup" }

export default async function PaidSetupPage() {
  await requireStaff()
  if (!commercialSetupQueueEnabled()) {
    return <section className="page">
      <PageHeader title="Paid setup" description="Telloya and Complete subscriptions whose payment is recorded and whose service is not active. Times are shown in UK time." />
      <section className="panel">
        <Notice tone="blocked">This queue is not enabled. It does not read subscriptions, and it does not start setup.</Notice>
      </section>
    </section>
  }
  const items = await loadSetupQueue()
  return <section className="page">
    <PageHeader title="Paid setup" description="Telloya and Complete subscriptions whose payment is recorded and whose service is not active. Times are shown in UK time." />
    <section className="panel">
      {items === null ? <Notice tone="warning">The setup queue could not be read. This does not say whether any payment was recorded.</Notice> : <SetupQueueView items={items} beginSetupEnabled={commercialSetupQueueEnabled() && commercialBeginSetupEnabled()} confirmPreferencesEnabled={commercialSetupQueueEnabled() && commercialConfirmPreferencesEnabled()} confirmAiConfigurationEnabled={commercialSetupQueueEnabled() && commercialConfirmAiConfigurationEnabled()} recordNumberAllocationEnabled={commercialSetupQueueEnabled() && commercialRecordNumberAllocationEnabled()} recordForwardingInstructionsEnabled={commercialSetupQueueEnabled() && commercialRecordForwardingInstructionsEnabled()} providerLane={commercialProviderLane()} />}
    </section>
  </section>
}
