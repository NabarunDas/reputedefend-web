import Link from "next/link"
import type { CasePrerequisiteGroup } from "@/lib/case-flow/model"
import { Badge } from "../../../ui"
import { ownerLabel, prerequisiteStatePresentation } from "./presentation"

/**
 * What has to be in place for work to proceed, per track.
 *
 * Each item's state is the model's, including the group's `satisfied` flag.
 * The page does not re-read a membership row or an order to second-guess
 * them, and it does not turn the list into a row of commands: the commands
 * stay where they already are, and these items link to them.
 *
 * The heading says what the list is rather than when it applies, because the
 * same list reappears if a permission or payment is invalidated later, by
 * which time "before work can begin" would be untrue.
 */
export function CasePrerequisites({ groups }: { groups: CasePrerequisiteGroup[] }) {
  if (groups.length === 0) return null
  return <section className="panel cockpit-prerequisites" id="case-prerequisites" aria-labelledby="case-prerequisites-heading">
    <h2 id="case-prerequisites-heading">Case prerequisites</h2>
    {groups.map(group => <div key={group.id} className="prerequisite-group">
      <h3>{group.label}</h3>
      <p className="badge-row">
        <Badge tone={group.satisfied ? "success" : "neutral"}>{group.satisfied ? "All in place" : "Not complete"}</Badge>
      </p>
      <ul className="prerequisite-list">
        {group.items.map(item => {
          const state = prerequisiteStatePresentation[item.state]
          const linked = item.destination && item.state !== "SATISFIED" && item.state !== "NOT_APPLICABLE"
          return <li key={item.id} className={`prerequisite-item prerequisite-${state.tone}`}>
            <p className="prerequisite-mark" aria-hidden="true">{state.symbol}</p>
            <p className="prerequisite-label">
              {linked && item.destination
                ? <Link href={item.destination.href}>{item.label}</Link>
                : item.label}
            </p>
            <p className="prerequisite-state">{state.status}</p>
            <p className="prerequisite-detail muted">{item.detail} Owned by {ownerLabel(item.owner)}.</p>
          </li>
        })}
      </ul>
    </div>)}
  </section>
}
