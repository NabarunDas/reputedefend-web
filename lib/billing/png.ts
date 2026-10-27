/**
 * Decodes an 8-bit PNG into DeviceRGB pixels on white.
 * Billing PDFs embed the ProfileRelaunch logo this way. No image library is added.
 */
import { inflateSync } from "node:zlib"

export type RgbImage = { width: number; height: number; rgb: Uint8Array }

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const both = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= both) return left
  if (upDistance <= both) return up
  return upLeft
}

function unfilter(data: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels
  const raw = new Uint8Array(stride * height)
  let source = 0
  for (let row = 0; row < height; row += 1) {
    const filter = data[source]
    source += 1
    const start = row * stride
    for (let column = 0; column < stride; column += 1) {
      const value = data[source]
      source += 1
      const left = column >= channels ? raw[start + column - channels] : 0
      const up = row > 0 ? raw[start - stride + column] : 0
      const upLeft = row > 0 && column >= channels ? raw[start - stride + column - channels] : 0
      let decoded = value
      if (filter === 1) decoded = value + left
      else if (filter === 2) decoded = value + up
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2)
      else if (filter === 4) decoded = value + paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error("unsupported PNG filter")
      raw[start + column] = decoded & 0xff
    }
  }
  return raw
}

export function pngToRgb(png: Uint8Array, maxWidth = 640): RgbImage {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (png.length < 8 || signature.some((byte, index) => png[index] !== byte)) throw new Error("logo is not a PNG")
  let offset = 8
  let width = 0
  let height = 0
  let color = -1
  const idat: Uint8Array[] = []
  while (offset + 8 <= png.length) {
    const length = png[offset] * 2 ** 24 + png[offset + 1] * 2 ** 16 + png[offset + 2] * 2 ** 8 + png[offset + 3]
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = data[0] * 2 ** 24 + data[1] * 2 ** 16 + data[2] * 2 ** 8 + data[3]
      height = data[4] * 2 ** 24 + data[5] * 2 ** 16 + data[6] * 2 ** 8 + data[7]
      if (data[8] !== 8 || data[12] !== 0) throw new Error("logo PNG is not an 8-bit image")
      color = data[9]
    } else if (type === "IDAT") {
      idat.push(data)
    } else if (type === "IEND") {
      break
    }
    offset += 12 + length
  }
  if (!width || !height || (color !== 2 && color !== 6)) throw new Error("logo PNG is not RGB")
  const compressed = new Uint8Array(idat.reduce((sum, chunk) => sum + chunk.length, 0))
  let position = 0
  for (const chunk of idat) {
    compressed.set(chunk, position)
    position += chunk.length
  }
  const channels = color === 6 ? 4 : 3
  const raw = unfilter(inflateSync(compressed), width, height, channels)
  const targetWidth = Math.min(width, maxWidth)
  const targetHeight = Math.max(1, Math.round(height * targetWidth / width))
  const rgb = new Uint8Array(targetWidth * targetHeight * 3)
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y * height / targetHeight))
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x * width / targetWidth))
      const source = (sourceY * width + sourceX) * channels
      const alpha = channels === 4 ? raw[source + 3] / 255 : 1
      const destination = (y * targetWidth + x) * 3
      for (let channel = 0; channel < 3; channel += 1) {
        rgb[destination + channel] = Math.round(raw[source + channel] * alpha + 255 * (1 - alpha))
      }
    }
  }
  return { width: targetWidth, height: targetHeight, rgb }
}
