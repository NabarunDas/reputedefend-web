import { describe, expect, it } from "vitest"
import { DOCX_MIME, PREVIEW_UNAVAILABLE, evidenceActions } from "./model"

const base = {
  uploadStatus: "UPLOADED",
  scanStatus: "NO_THREATS_FOUND",
  validationStatus: "VALID",
  reviewStatus: "UNREVIEWED",
  contentType: "application/pdf",
}

describe("evidence action availability", () => {
  it("enables only scan refresh while a scan is pending", () => {
    expect(evidenceActions({ ...base, scanStatus: "PENDING", validationStatus: "PENDING" })).toMatchObject({
      refresh: true, view: false, download: false, accept: false, reject: false, visibility: false,
    })
  })
  it("blocks threat detections completely", () => {
    expect(evidenceActions({ ...base, scanStatus: "THREATS_FOUND", validationStatus: "PENDING" })).toMatchObject({
      refresh: false, view: false, download: false, accept: false, reject: false,
      threatBlocked: true, statusLabel: "Threat detected — file blocked",
    })
  })
  it("keeps failed scans refreshable and closed", () => {
    expect(evidenceActions({ ...base, scanStatus: "FAILED", validationStatus: "PENDING" })).toMatchObject({
      refresh: true, view: false, download: false, accept: false, reject: false,
    })
  })
  it("disables view and review when validation fails", () => {
    expect(evidenceActions({ ...base, validationStatus: "INVALID" })).toMatchObject({
      view: false, download: false, accept: false, validationFailed: true,
    })
  })
  it("enables view and review for a clean PDF and download-only for DOCX", () => {
    expect(evidenceActions(base)).toMatchObject({ view: true, download: true, accept: true, reject: true, visibility: false })
    expect(evidenceActions({ ...base, contentType: DOCX_MIME })).toMatchObject({
      view: false, download: true, accept: true, viewHint: PREVIEW_UNAVAILABLE,
    })
  })
  it("treats superseded versions as read-only history", () => {
    expect(evidenceActions({ ...base, reviewStatus: "SUPERSEDED" })).toMatchObject({
      view: true, download: true, accept: false, reject: false, visibility: false,
    })
  })
})
