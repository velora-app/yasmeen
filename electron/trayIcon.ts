import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nativeImage, type NativeImage } from 'electron'

const menuBarHeight = 36

export function createTrayImage(): NativeImage {
  const file = path.join(__dirname, '../renderer/mark.png')
  const source = nativeImage.createFromBuffer(readFileSync(file))
  const { width, height } = source.getSize()
  const resized = source.resize({
    width: Math.max(1, Math.round((width / height) * menuBarHeight)),
    height: menuBarHeight,
  })
  return nativeImage.createFromBuffer(resized.toPNG(), { scaleFactor: 2 })
}
