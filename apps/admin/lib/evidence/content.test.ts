import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { validateEvidenceBytes } from "./content"

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x34])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const docx = zipSync({
  "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types></Types>'),
  "word/document.xml": strToU8('<?xml version="1.0"?><w:document></w:document>'),
})
const fakeDocx = zipSync({ "readme.txt": strToU8("not a word document") })

describe("evidence content signatures", () => {
  it("rejects invalid PDF signatures", () => {
    expect(validateEvidenceBytes(pdf, "application/pdf")).toBeNull()
    expect(validateEvidenceBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf")).toBe("The PDF signature is not valid.")
    expect(validateEvidenceBytes(jpeg, "application/pdf")).toBe("The PDF signature is not valid.")
  })
  it("rejects invalid JPEG signatures", () => {
    expect(validateEvidenceBytes(jpeg, "image/jpeg")).toBeNull()
    expect(validateEvidenceBytes(png, "image/jpeg")).toBe("The JPEG signature is not valid.")
  })
  it("rejects invalid PNG signatures", () => {
    expect(validateEvidenceBytes(png, "image/png")).toBeNull()
    expect(validateEvidenceBytes(jpeg, "image/png")).toBe("The PNG signature is not valid.")
  })
  it("rejects invalid WebP signatures", () => {
    expect(validateEvidenceBytes(webp, "image/webp")).toBeNull()
    expect(validateEvidenceBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]), "image/webp")).toBe("The WebP signature is not valid.")
  })
  it("rejects a ZIP that is not a DOCX package", () => {
    expect(validateEvidenceBytes(fakeDocx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("The DOCX archive is missing required Word documents.")
    expect(validateEvidenceBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("The file is not a valid DOCX archive.")
  })
  it("accepts a DOCX that contains the required Word parts", () => {
    expect(validateEvidenceBytes(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull()
  })
})
