import { describe, expect, it } from "vitest"
import { stages } from "../cases/model"
import {
  casePhaseIds,
  casePhaseLabels,
  phaseByStage,
  phaseCompleteDetails,
  phaseForStage,
  phaseOrdinal,
  phaseUpcomingDetails,
  stageLabel,
  technicalStageLabels,
  technicalStages,
} from "./phases"

describe("case phases", () => {
  it("covers every work stage the database allows, and no others", () => {
    expect([...technicalStages].sort()).toEqual(Object.keys(stages).sort())
  })

  it("maps every technical stage to a phase", () => {
    for (const stage of technicalStages) {
      expect(casePhaseIds).toContain(phaseByStage[stage])
    }
  })

  it("treats payment and permission as the same human phase", () => {
    expect(phaseForStage("PAYMENT_REQUIRED")).toBe("PREREQUISITES")
    expect(phaseForStage("AUTHORIZATION_REQUIRED")).toBe("PREREQUISITES")
  })

  it("treats being ready to submit and having submitted as one phase", () => {
    expect(phaseForStage("READY_TO_SUBMIT")).toBe("SUBMISSION")
    expect(phaseForStage("SUBMITTED")).toBe("SUBMISSION")
  })

  it("groups the four post-submission stages under Decision", () => {
    expect(phaseForStage("WAITING_GOOGLE")).toBe("DECISION")
    expect(phaseForStage("OWNER_ACTION")).toBe("DECISION")
    expect(phaseForStage("FURTHER_REVIEW")).toBe("DECISION")
    expect(phaseForStage("OUTCOME_REVIEW")).toBe("DECISION")
  })

  it("shows an unknown stage plainly instead of failing the page", () => {
    expect(phaseForStage("SOMETHING_NEW")).toBe("RECEIVED")
    expect(stageLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW")
  })

  it("orders the phases as the journey runs", () => {
    expect(phaseOrdinal("RECEIVED")).toBeLessThan(phaseOrdinal("EVIDENCE"))
    expect(phaseOrdinal("PREREQUISITES")).toBeLessThan(phaseOrdinal("PREPARATION"))
    expect(phaseOrdinal("SUBMISSION")).toBeLessThan(phaseOrdinal("DECISION"))
    expect(phaseOrdinal("COMPLETE")).toBe(casePhaseIds.length - 1)
  })

  it("labels every phase and every stage", () => {
    for (const phase of casePhaseIds) {
      expect(casePhaseLabels[phase]).toBeTruthy()
      expect(phaseCompleteDetails[phase]).toBeTruthy()
      expect(phaseUpcomingDetails[phase]).toBeTruthy()
    }
    for (const stage of technicalStages) {
      expect(technicalStageLabels[stage]).toBeTruthy()
    }
  })

  it("does not claim Google has done anything while the case waits on it", () => {
    expect(technicalStageLabels.WAITING_GOOGLE).toBe("Waiting for Google")
    expect(technicalStageLabels.READY_TO_SUBMIT).toBe("Ready to submit")
  })
})
