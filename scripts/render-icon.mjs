import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const size = 1024
const pixels = Buffer.alloc(size * size * 4)
const leaves = [
  { from: [-0.5, -0.52], to: [-0.12, -0.06], radius: 0.18, color: [110, 231, 183] },
  { from: [0.52, -0.48], to: [0.14, -0.02], radius: 0.17, color: [52, 211, 153] },
  { from: [0, 0.16], to: [0, 0.6], radius: 0.15, color: [16, 185, 129] },
]

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const point = [(x / (size - 1)) * 2 - 1, (y / (size - 1)) * 2 - 1]
    pixels.set(paintMark(point[0], point[1], paleMint(x / (size - 1), y / (size - 1))), (y * size + x) * 4)
  }
}

mkdirSync('build/icon.iconset', { recursive: true })
const master = encodeRgbaPng(size, size, pixels)
writeFileSync('build/icon-1024.png', master)
writeFileSync('renderer/mark.png', markPng(256))

const iconsetSizes = [16, 32, 128, 256, 512]
for (const iconSize of iconsetSizes) {
  writeResized(master, iconSize, `build/icon.iconset/icon_${iconSize}x${iconSize}.png`)
  writeResized(master, iconSize * 2, `build/icon.iconset/icon_${iconSize}x${iconSize}@2x.png`)
}

execFileSync('iconutil', ['-c', 'icns', 'build/icon.iconset', '-o', 'build/icon.icns'])
rmSync('build/icon.iconset', { recursive: true, force: true })

function markPng(side) {
  const bitmap = Buffer.alloc(side * side * 4)
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const point = [(x / (side - 1)) * 2 - 1, (y / (side - 1)) * 2 - 1]
      const painted = paintMark(point[0], point[1], [0, 0, 0, 0])
      bitmap.set(painted, (y * side + x) * 4)
    }
  }
  return encodeRgbaPng(side, side, bitmap)
}

function paleMint(x, y) {
  const light = [244, 253, 248]
  const deep = [220, 252, 231]
  const t = Math.min(1, Math.max(0, x * 0.35 + y * 0.65))
  return [...light.map((channel, index) => Math.round(channel + (deep[index] - channel) * t)), 255]
}

function paintMark(nx, ny, base) {
  let color = base.slice()
  for (const leaf of leaves) {
    const coverage = leafCoverage(nx, ny, leaf)
    if (coverage === 0) continue
    if (color[3] === 0) {
      color = [...leaf.color, Math.round(255 * coverage)]
      continue
    }
    color = [
      ...leaf.color.map((channel, index) => Math.round(color[index] + (channel - color[index]) * coverage)),
      Math.round(color[3] + (255 - color[3]) * coverage),
    ]
  }
  return color
}

function leafCoverage(nx, ny, leaf) {
  const [x1, y1] = leaf.from
  const [x2, y2] = leaf.to
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const progress = Math.max(0, Math.min(1, ((nx - x1) * dx + (ny - y1) * dy) / lengthSquared))
  const distance = Math.hypot(nx - (x1 + dx * progress), ny - (y1 + dy * progress))
  if (distance > leaf.radius) return 0
  const edge = leaf.radius * 0.86
  return distance < edge ? 1 : (leaf.radius - distance) / (leaf.radius - edge)
}

function writeResized(sourcePng, targetSize, filePath) {
  const source = decodeRgba(sourcePng)
  const resized = Buffer.alloc(targetSize * targetSize * 4)
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = Math.min(size - 1, Math.floor((x / targetSize) * size))
      const sourceY = Math.min(size - 1, Math.floor((y / targetSize) * size))
      source.copy(resized, (y * targetSize + x) * 4, (sourceY * size + sourceX) * 4, (sourceY * size + sourceX) * 4 + 4)
    }
  }
  writeFileSync(filePath, encodeRgbaPng(targetSize, targetSize, resized))
}

function decodeRgba(png) {
  return pixels
}

function encodeRgbaPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0, 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
