import { unzipSync } from "fflate"
import { MAX_EVIDENCE_BYTES, type AllowedMime } from "./model"

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.length <= bytes.length && signature.every((value, index) => bytes[index] === value)
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

function validateDocx(bytes: Uint8Array): string | null {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && !startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) && !startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    return "The file is not a valid DOCX archive."
  }
  try {
    const entries = unzipSync(bytes, {
      filter: file => (file.name === "[Content_Types].xml" || file.name === "word/document.xml") && file.originalSize > 0 && file.originalSize <= MAX_EVIDENCE_BYTES,
    })
    if (!entries["[Content_Types].xml"] || !entries["word/document.xml"]) return "The DOCX archive is missing required Word documents."
    return null
  } catch {
    return "The file is not a valid DOCX archive."
  }
}

export function validateEvidenceBytes(bytes: Uint8Array, contentType: AllowedMime): string | null {
  if (!bytes.length) return "Empty files cannot be stored."
  if (contentType === "application/pdf") return ascii(bytes, 0, 5) === "%PDF-" ? null : "The PDF signature is not valid."
  if (contentType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]) ? null : "The JPEG signature is not valid."
  if (contentType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? null : "The PNG signature is not valid."
  if (contentType === "image/webp") return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP" ? null : "The WebP signature is not valid."
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return validateDocx(bytes)
  return "That file type is not accepted."
}
