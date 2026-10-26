/**
 * Guided Step 9 reads the existing case submission rows.
 *
 * Recording an attempt is not a Google submission. A result is only a
 * decision or a withdrawal. This module does not create a second command.
 */

import type { CaseFlowFacts } from "../case-flow/model"
import type { Submission } from "../cases/model"
import { customerMailStatus } from "./customer-mail"

/** Stages `admin_case_command_v1` already allows for operation `submission`. */
const recordingStages = ["SERVICE_SELECTION", "PAYMENT_REQUIRED", "AUTHORIZATION_REQUIRED", "READY_TO_SUBMIT", "FURTHER_REVIEW"]

export type SubmissionDisplayState =
  | "Submitted, awaiting Google's decision"
  | "Decision recorded"
  | "Withdrawn"
  | "Result not recognised"

export type JourneySubmissionAttempt = {
  id: string
  reference: string
  channel: string
  submittedAt: string
  party: string
  evidence: string
  state: SubmissionDisplayState
  resultNote: string | null
}

export type JourneySubmissionRequirement = {
  label: string
  state: "Met" | "Not met"
  detail: string
}

export type JourneySubmissionCommands = {
  record: boolean
  resolveIds: string[]
}

export type JourneySubmissionPanel = {
  headline: string
  detail: string
  attempts: JourneySubmissionAttempt[]
  requirements: JourneySubmissionRequirement[]
  notices: string[]
  who: string
  /** Null withholds every submission command. */
  commands: JourneySubmissionCommands | null
  /** The next Managed progress or result email that has not been queued. */
  noticeRecovery: "submission" | "result" | null
}

export function authoritativeSubmissionResult(result: string | null): boolean {
  return result === "DECIDED" || result === "WITHDRAWN"
}

/** Guided attempts are the customer's. Managed attempts are ProfileRelaunch's. */
export function submissionPartyMatches(track: string, actor: string): boolean {
  return (track === "GUIDED" && actor === "CUSTOMER") || (track === "MANAGED" && actor === "ADMIN")
}

function sameInstant(left: string, right: string): boolean {
  const a = Date.parse(left)
  const b = Date.parse(right)
  return Number.isFinite(a) && a === b
}

function evidenceKept(row: Submission): boolean {
  return row.reference.trim().length >= 1 && row.channel.trim().length >= 3 && row.evidence.trim().length >= 10
}

export function submissionRecordsDisagree(
  facts: CaseFlowFacts,
  submissions: Submission[] | null,
  caseTrack: string,
): boolean {
  if (!submissions || caseTrack !== facts.serviceTrack) return true
  const projected = [...facts.submissions].sort((a, b) => a.id.localeCompare(b.id))
  const loaded = [...submissions].sort((a, b) => a.id.localeCompare(b.id))
  if (projected.length !== loaded.length) return true
  return projected.some((row, index) => {
    const found = loaded[index]
    return row.id !== found.id
      || row.actor !== found.actor
      || !sameInstant(row.submittedAt, found.submittedAt)
      || (row.result ?? null) !== (found.result ?? null)
      || found.track !== caseTrack
      || !submissionPartyMatches(caseTrack, found.actor)
      || !submissionPartyMatches(caseTrack, row.actor)
      || !submissionPartyMatches(found.track, found.actor)
      || !evidenceKept(found)
      || (found.result !== null && !authoritativeSubmissionResult(found.result))
  })
}

function partyLabel(actor: string): string {
  if (actor === "CUSTOMER") return "the customer"
  if (actor === "ADMIN") return "ProfileRelaunch"
  return "an unrecognised party"
}

function attemptState(result: string | null): SubmissionDisplayState {
  if (result === null) return "Submitted, awaiting Google's decision"
  if (result === "DECIDED") return "Decision recorded"
  if (result === "WITHDRAWN") return "Withdrawn"
  return "Result not recognised"
}

export function buildJourneySubmissionPanel(input: {
  facts: CaseFlowFacts
  submissions: Submission[] | null
  status: string
  track: string
  stage: string
}): JourneySubmissionPanel {
  const loaded = input.submissions
  const disagreed = submissionRecordsDisagree(input.facts, loaded, input.track)
  const rows = loaded ?? []
  const unresolved = rows.filter(row => row.result === null)
  const unrecognised = rows.some(row => row.result !== null && !authoritativeSubmissionResult(row.result))
  const closed = input.status === "CLOSED" || input.status === "CANCELLED"
  const trackReady = input.track === "GUIDED" || input.track === "MANAGED"
  const stageReady = recordingStages.includes(input.stage)
  const trackConflict = rows.some(row => row.track !== input.track)
  const notices: string[] = []
  if (!loaded) notices.push("The case submission record could not be loaded, so no submission command is offered from here.")
  else if (trackConflict) notices.push("A recorded attempt uses a different service track from this case. The case command does not change the track after a submission, so no submission command is offered from here.")
  else if (disagreed) notices.push("The case submission record and the case-flow projection do not describe the same attempts. These records disagree, so no submission command is offered from here.")
  if (loaded && rows.some(row => !evidenceKept(row))) {
    notices.push("A submission is missing its reference, channel or evidence. That attempt is not offered for a new result.")
  }
  if (!disagreed && !trackReady) notices.push("The service track is not selected, so a submission cannot be recorded.")
  if (!disagreed && unresolved.length > 0) notices.push("An attempt is recorded with no decision against it. Nothing further can be recorded until that attempt is resolved.")
  if (!disagreed && trackReady && !closed && unresolved.length === 0 && !stageReady) {
    notices.push("A new attempt can be recorded only at the stages the case command already allows.")
  }
  const progressMail = loaded ? input.facts.communications.filter(item => item.templateKey === "MANAGED_PROGRESS" && item.lifecycle !== "CANCELLED").length : 0
  const resultMail = loaded ? input.facts.communications.filter(item => item.templateKey === "MANAGED_RESULT" && item.lifecycle !== "CANCELLED").length : 0
  const resultCount = rows.filter(row => row.result !== null).length
  const noticeRecovery = input.track === "MANAGED" && loaded && !disagreed
    ? progressMail < rows.length
      ? "submission"
      : resultMail < resultCount
        ? "result"
        : null
    : null
  if (input.track === "MANAGED" && loaded && !disagreed && rows.length > 0) {
    notices.push(customerMailStatus(input.facts.communications, "MANAGED_PROGRESS", "progress email"))
    if (resultCount > 0) notices.push(customerMailStatus(input.facts.communications, "MANAGED_RESULT", "result email"))
  }

  const commands = loaded && !disagreed && !unrecognised
    ? {
      record: !closed && trackReady && stageReady && unresolved.length === 0,
      resolveIds: !closed ? unresolved.map(row => row.id) : [],
    }
    : null

  const decided = rows.length > 0 && rows.every(row => row.result === "DECIDED")
  const withdrawn = rows.length > 0 && rows.every(row => row.result === "WITHDRAWN")
  const headline = disagreed
    ? "Submission records disagree"
    : unrecognised
      ? "Submission result is not recognised"
      : rows.length === 0
        ? "Not submitted"
        : unresolved.length > 0
          ? "Submitted, awaiting Google's decision"
          : withdrawn
            ? "Withdrawn"
            : decided
              ? "Decision recorded"
              : "Submission results are recorded"

  const detail = "This step records a submission already completed outside the portal, then its decision or withdrawal. Saving the form does not submit anything to Google."
  const ready = !disagreed && !unrecognised && rows.length > 0 && unresolved.length === 0 && rows.every(row => authoritativeSubmissionResult(row.result))
  const requirements: JourneySubmissionRequirement[] = [
    {
      label: "Submission attempt",
      state: !disagreed && rows.length > 0 ? "Met" : "Not met",
      detail: input.track === "MANAGED"
        ? "A Managed attempt is one ProfileRelaunch already completed. Recording it does not send it."
        : "A Guided attempt is one the customer already completed. Recording it does not send it.",
    },
    {
      label: "Decision or withdrawal",
      state: ready ? "Met" : "Not met",
      detail: "An open attempt is still waiting. A decision and a withdrawal are different results, and neither contacts Google.",
    },
  ]
  const who = trackConflict
    ? "ProfileRelaunch reconciles the recorded submission track with the case track before treating an attempt as finished."
    : disagreed || unrecognised
      ? "ProfileRelaunch reconciles the submission records before treating an attempt as finished."
    : unresolved.length > 0
      ? "Google has not answered the open attempt. ProfileRelaunch records the decision or withdrawal when it arrives."
      : ready && withdrawn
        ? "The recorded attempt was withdrawn. Outcome review stays on a later step."
        : ready
          ? "The result is recorded. Outcome review and billing stay on later steps."
          : input.track === "MANAGED"
            ? "ProfileRelaunch records an attempt it has already completed outside this portal."
            : "ProfileRelaunch records an attempt the customer has already completed outside this portal."

  return {
    headline,
    detail,
    attempts: rows.map(row => ({
      id: row.id,
      reference: row.reference,
      channel: row.channel,
      submittedAt: row.submittedAt,
      party: partyLabel(row.actor),
      evidence: row.evidence,
      state: attemptState(row.result),
      resultNote: row.resultNote,
    })),
    requirements,
    notices,
    who,
    commands,
    noticeRecovery,
  }
}
