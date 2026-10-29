import type { JourneyPreparationPanel } from "@/lib/case-journey/preparation"
import { DevSendQueuedEmailForm } from "@/app/communications/forms"
import { PreparedPackPanel, RecoverPackEmailForm } from "../evidence/forms"

/**
 * Step 8 reuses the existing pack commands.
 * Approval and publication stay separate. Nothing here submits to Google.
 */
export function PreparationPanel({ caseId, panel }: { caseId: string; panel: JourneyPreparationPanel }) {
  return <div className="guided-facts" data-preparation={panel.headline}>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    {panel.packs.length > 0 && <ul>
      {panel.packs.map(pack => <li key={pack.id}>
        <strong>Pack #{pack.number}: {pack.state}.</strong> {pack.items} item{pack.items === 1 ? "" : "s"}.{pack.history ? pack.state === "Superseded" ? " This approved history is read-only." : " Previous pack. It stays in the history and is not the pack to change." : " This is the current pack."}
      </li>)}
    </ul>}
    <ul>
      {panel.requirements.map(item => <li key={item.label}><strong>{item.label}: {item.state}.</strong> {item.detail}</li>)}
    </ul>
    <p><strong>Who must act.</strong> {panel.who}</p>
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {panel.packEmailRecovery && <RecoverPackEmailForm caseId={caseId} pack={panel.packEmailRecovery} />}
    {panel.packNotificationRecovery && <DevSendQueuedEmailForm
      communicationId={panel.packNotificationRecovery.communicationId}
      label="Process queued notification now"
      confirmLabel="Process this queued pack-ready notification"
      intro="Processes this one queued pack-ready notification through the durable SEND_EMAIL job. It does not send a different email, a case-closure email, or run payments, Guard, or Google."
    />}
    {panel.commands && <PreparedPackPanel caseId={caseId} packs={panel.commands} guided={panel.guided} />}
    <p>Saving a draft, approving it, or publishing it does not submit anything to Google and does not make the files available without the existing case-access check.</p>
  </div>
}
