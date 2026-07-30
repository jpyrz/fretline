import type { Lane } from '../../types/game'
import {
  SURFACE_END_PROGRESS,
  highwayLaneX,
  highwayPoint,
  trackEdge,
  trackPath,
} from './highwayGeometry'

const warpedHighwayCache = new WeakMap<
  HTMLImageElement,
  { key: string; canvas: HTMLCanvasElement }
>()

interface StaticHighwayCacheEntry {
  canvas: HTMLCanvasElement
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
  starPowerActive: boolean
  highwayLength: number
  backgroundImage: HTMLImageElement | null
  backgroundDim: number
  highwayImage: HTMLImageElement | null
  highwayOpacity: number
}

const staticHighwayCache = new WeakMap<
  HTMLCanvasElement,
  StaticHighwayCacheEntry
>()

function warpedHighwayTexture(
  image: HTMLImageElement,
  width: number,
  height: number,
  highwayLength: number,
): HTMLCanvasElement {
  const density = Math.min(window.devicePixelRatio || 1, 2)
  const key = `${Math.ceil(width)}:${Math.ceil(height)}:${highwayLength}:${density}`
  const cached = warpedHighwayCache.get(image)
  if (cached?.key === key) return cached.canvas

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * density))
  canvas.height = Math.max(1, Math.ceil(height * density))
  const context = canvas.getContext('2d')
  if (context) {
    context.setTransform(density, 0, 0, density, 0, 0)
    const slices = 72
    for (let slice = 0; slice < slices; slice += 1) {
      const progressStart = (slice / slices) * SURFACE_END_PROGRESS
      const progressEnd = ((slice + 1) / slices) * SURFACE_END_PROGRESS
      const start = highwayPoint(width, height, progressStart, highwayLength)
      const end = highwayPoint(width, height, progressEnd, highwayLength)
      context.drawImage(
        image,
        0,
        (slice / slices) * image.naturalHeight,
        image.naturalWidth,
        image.naturalHeight / slices + 1,
        trackEdge(start, -1),
        start.y,
        start.trackWidth,
        Math.max(1, end.y - start.y + 1),
      )
    }
  }
  warpedHighwayCache.set(image, { key, canvas })
  return canvas
}

export function resizeHighwayCanvas(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.floor(bounds.width * ratio))
  const height = Math.max(1, Math.floor(bounds.height * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  })
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return context
}

function drawHighwaySurfaceUnderlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPowerActive: boolean,
  highwayLength: number,
  backgroundImage: HTMLImageElement | null,
  backgroundDim: number,
  highwayImage: HTMLImageElement | null,
  highwayOpacity: number,
): void {
  const top = highwayPoint(width, height, 0, highwayLength)
  const bottom = highwayPoint(
    width,
    height,
    SURFACE_END_PROGRESS,
    highwayLength,
  )

  if (
    backgroundImage &&
    backgroundImage.complete &&
    backgroundImage.naturalWidth > 0
  ) {
    const imageRatio =
      backgroundImage.naturalWidth / backgroundImage.naturalHeight
    const viewportRatio = width / height
    const sourceWidth =
      imageRatio > viewportRatio
        ? backgroundImage.naturalHeight * viewportRatio
        : backgroundImage.naturalWidth
    const sourceHeight =
      imageRatio > viewportRatio
        ? backgroundImage.naturalHeight
        : backgroundImage.naturalWidth / viewportRatio
    context.drawImage(
      backgroundImage,
      (backgroundImage.naturalWidth - sourceWidth) / 2,
      (backgroundImage.naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    )
    context.fillStyle = `rgba(2, 3, 7, ${Math.max(
      0,
      Math.min(0.9, backgroundDim / 100),
    )})`
    context.fillRect(0, 0, width, height)
    const ambient = context.createRadialGradient(
      width / 2,
      height * 0.45,
      width * 0.05,
      width / 2,
      height * 0.5,
      width * 0.78,
    )
    ambient.addColorStop(
      0,
      starPowerActive ? 'rgba(20,61,97,0.34)' : 'rgba(18,23,38,0.18)',
    )
    ambient.addColorStop(1, 'rgba(2,3,7,0.68)')
    context.fillStyle = ambient
    context.fillRect(0, 0, width, height)
  } else {
    const background = context.createRadialGradient(
      width / 2,
      height * 0.45,
      width * 0.05,
      width / 2,
      height * 0.5,
      width * 0.78,
    )
    background.addColorStop(0, starPowerActive ? '#143d61' : '#121726')
    background.addColorStop(0.62, starPowerActive ? '#071827' : '#060811')
    background.addColorStop(1, '#020307')
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
  }

  context.save()
  trackPath(context, top, bottom)
  context.clip()

  const surface = context.createLinearGradient(0, top.y, 0, bottom.y)
  surface.addColorStop(0, starPowerActive ? '#152b3d' : '#11151c')
  surface.addColorStop(0.46, starPowerActive ? '#10283b' : '#17191d')
  surface.addColorStop(1, starPowerActive ? '#071521' : '#090a0c')
  context.fillStyle = surface
  context.fillRect(
    trackEdge(bottom, -1),
    top.y,
    bottom.trackWidth,
    bottom.y - top.y,
  )

  if (highwayImage && highwayImage.complete && highwayImage.naturalWidth > 0) {
    context.save()
    context.globalAlpha = Math.max(0.2, Math.min(1, highwayOpacity / 100))
    context.drawImage(
      warpedHighwayTexture(highwayImage, width, height, highwayLength),
      0,
      0,
      width,
      height,
    )
    context.restore()
  }

  for (let band = 0; band < 14; band += 1) {
    const startProgress = (band / 14) * SURFACE_END_PROGRESS
    const endProgress = ((band + 1) / 14) * SURFACE_END_PROGRESS
    const start = highwayPoint(width, height, startProgress, highwayLength)
    const end = highwayPoint(width, height, endProgress, highwayLength)
    context.beginPath()
    context.moveTo(trackEdge(start, -1), start.y)
    context.lineTo(start.center, end.y - (end.y - start.y) * 0.28)
    context.lineTo(trackEdge(start, 1), start.y)
    context.lineTo(trackEdge(end, 1), end.y)
    context.lineTo(end.center, end.y - (end.y - start.y) * 0.22)
    context.lineTo(trackEdge(end, -1), end.y)
    context.closePath()
    context.fillStyle =
      band % 2 === 0 ? 'rgba(255,255,255,0.024)' : 'rgba(0,0,0,0.08)'
    context.fill()
  }

  for (let streak = 0; streak < 22; streak += 1) {
    const x = trackEdge(bottom, -1) + (bottom.trackWidth * streak) / 21
    const opacity = 0.012 + ((streak * 7) % 5) * 0.004
    context.fillStyle = `rgba(222, 228, 238, ${opacity})`
    context.fillRect(x, top.y, 1, bottom.y - top.y)
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height * 0.54,
    width * 0.14,
    width / 2,
    height * 0.54,
    width * 0.55,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  context.fillStyle = vignette
  context.fillRect(0, 0, width, height)
  context.restore()
}

export function drawHighwaySurfaceOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPowerActive: boolean,
  songTimeSeconds: number,
  highwayLength: number,
): void {
  const top = highwayPoint(width, height, 0, highwayLength)
  const bottom = highwayPoint(
    width,
    height,
    SURFACE_END_PROGRESS,
    highwayLength,
  )

  if (starPowerActive) {
    context.save()
    trackPath(context, top, bottom)
    context.clip()
    const pulse = 0.12 + (Math.sin(songTimeSeconds * 8) + 1) * 0.035
    const energy = context.createLinearGradient(0, top.y, 0, bottom.y)
    energy.addColorStop(0, 'rgba(140, 229, 255, 0.02)')
    energy.addColorStop(0.72, `rgba(78, 194, 255, ${pulse})`)
    energy.addColorStop(1, 'rgba(196, 246, 255, 0.2)')
    context.fillStyle = energy
    context.fillRect(
      trackEdge(bottom, -1),
      top.y,
      bottom.trackWidth,
      bottom.y - top.y,
    )
    context.restore()
  }

  for (let laneNumber = 0; laneNumber < 5; laneNumber += 1) {
    const lane = laneNumber as Lane
    context.beginPath()
    context.moveTo(highwayLaneX(width, lane, 0), top.y)
    context.lineTo(
      highwayLaneX(width, lane, SURFACE_END_PROGRESS),
      bottom.y,
    )
    context.strokeStyle = starPowerActive
      ? 'rgba(177, 236, 255, 0.38)'
      : 'rgba(207, 214, 226, 0.2)'
    context.lineWidth = 1.25
    context.shadowColor = starPowerActive
      ? 'rgba(91, 210, 255, 0.72)'
      : 'rgba(255,255,255,0.22)'
    context.shadowBlur = starPowerActive ? 9 : 4
    context.stroke()
  }
  context.shadowBlur = 0

  for (const side of [-1, 1] as const) {
    context.beginPath()
    context.moveTo(trackEdge(top, side), top.y)
    context.lineTo(trackEdge(bottom, side), bottom.y)
    context.strokeStyle = 'rgba(4, 5, 8, 0.96)'
    context.lineWidth = 12
    context.stroke()

    context.beginPath()
    context.moveTo(trackEdge(top, side), top.y)
    context.lineTo(trackEdge(bottom, side), bottom.y)
    const rail = context.createLinearGradient(
      trackEdge(top, side),
      top.y,
      trackEdge(bottom, side),
      bottom.y,
    )
    rail.addColorStop(0, '#77818c')
    rail.addColorStop(0.45, '#29313a')
    rail.addColorStop(0.72, '#aeb6bd')
    rail.addColorStop(1, '#3b444d')
    context.strokeStyle = rail
    context.lineWidth = 6
    context.shadowColor = starPowerActive
      ? 'rgba(105, 220, 255, 0.9)'
      : 'rgba(124, 153, 190, 0.32)'
    context.shadowBlur = starPowerActive ? 16 : 8
    context.stroke()

    context.beginPath()
    context.moveTo(trackEdge(top, side) - side * 1.4, top.y)
    context.lineTo(trackEdge(bottom, side) - side * 1.4, bottom.y)
    context.strokeStyle = 'rgba(235, 241, 247, 0.48)'
    context.lineWidth = 1
    context.stroke()
  }
  context.shadowBlur = 0
}

export function cachedHighwaySurface(
  target: HTMLCanvasElement,
  width: number,
  height: number,
  starPowerActive: boolean,
  highwayLength: number,
  backgroundImage: HTMLImageElement | null,
  backgroundDim: number,
  highwayImage: HTMLImageElement | null,
  highwayOpacity: number,
): HTMLCanvasElement {
  const cached = staticHighwayCache.get(target)
  if (
    cached &&
    cached.pixelWidth === target.width &&
    cached.pixelHeight === target.height &&
    cached.width === width &&
    cached.height === height &&
    cached.starPowerActive === starPowerActive &&
    cached.highwayLength === highwayLength &&
    cached.backgroundImage === backgroundImage &&
    cached.backgroundDim === backgroundDim &&
    cached.highwayImage === highwayImage &&
    cached.highwayOpacity === highwayOpacity
  ) {
    return cached.canvas
  }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d', { alpha: false })
  if (context) {
    const density = Math.min(window.devicePixelRatio || 1, 2)
    context.setTransform(density, 0, 0, density, 0, 0)
    drawHighwaySurfaceUnderlay(
      context,
      width,
      height,
      starPowerActive,
      highwayLength,
      backgroundImage,
      backgroundDim,
      highwayImage,
      highwayOpacity,
    )
  }

  staticHighwayCache.set(target, {
    canvas,
    pixelWidth: target.width,
    pixelHeight: target.height,
    width,
    height,
    starPowerActive,
    highwayLength,
    backgroundImage,
    backgroundDim,
    highwayImage,
    highwayOpacity,
  })
  return canvas
}
