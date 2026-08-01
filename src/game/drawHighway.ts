import type {
  ChartNote,
  GameFrame,
  Lane,
  ParsedChart,
} from '../types/game'
import { HIT_WINDOW_MS } from '../lib/scoring'
import { countdownCue } from './playbackTimeline'
import { visibleBeatMarkers } from './rendering/beatMarkers'
import {
  DEFAULT_HIGHWAY_LENGTH,
  DEFAULT_HIT_LINE_RATIO,
  TAP_HIT_LINE_RATIO,
  highwayLaneX,
  highwayPoint,
  noteRadius,
  receptorRadius,
  trackEdge,
  trackPath,
  travelSecondsForNoteSpeed,
  type HighwayPoint,
} from './rendering/highwayGeometry'
import {
  noteRenderState,
  visibleNoteIndices,
  type NoteRenderState,
} from './rendering/noteVisibility'
import { drawTapSweepPaths } from './rendering/tapSweepPath'
import {
  HIT_FIRE_ATLAS,
  STAR_POWER_LIGHTNING_ATLAS,
  drawSpriteFrame,
  gameplayVfxImage,
} from './rendering/vfxSprites'
import {
  cachedHighwaySurface,
  drawHighwaySurfaceOverlay,
  resizeHighwayCanvas,
} from './rendering/highwaySurface'

export {
  highwayLaneX,
  highwayTopY,
  highwayTrackWidth,
  projectHighwayProgress,
  travelSecondsForNoteSpeed,
} from './rendering/highwayGeometry'
export { visibleNoteIndices } from './rendering/noteVisibility'

const LANE_COLORS = ['#36d65b', '#f23b45', '#f4db2d', '#278de8', '#f28a22']
const STAR_POWER_COLOR = '#37cfff'
const STAR_POWER_DARK_COLOR = '#167aa8'

export interface HighwayVisualOptions {
  backgroundImage?: HTMLImageElement | null
  backgroundDim?: number
  highwayImage?: HTMLImageElement | null
  highwayOpacity?: number
  missFeedback?: boolean
  tapMode?: boolean
}

export function shouldRenderStarPowerNote(
  note: ChartNote,
  frame: Pick<GameFrame, 'starPowerPhraseStates'>,
): boolean {
  if (!note.starPower) return false
  const phraseIndices = note.starPowerPhraseIndices
  const phraseStates = frame.starPowerPhraseStates
  if (!phraseIndices?.length || !phraseStates) return true
  return phraseIndices.some(
    (phraseIndex) => phraseStates[phraseIndex] !== 'failed',
  )
}

function ellipseGradient(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  center: string,
  edge: string,
): CanvasGradient {
  const gradient = context.createRadialGradient(
    x - radius * 0.24,
    y - radius * 0.28,
    radius * 0.08,
    x,
    y,
    radius,
  )
  gradient.addColorStop(0, center)
  gradient.addColorStop(0.56, center)
  gradient.addColorStop(1, edge)
  return gradient
}

function traceStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerRadiusX: number,
  outerRadiusY: number,
  innerRatio = 0.48,
): void {
  context.beginPath()
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    const radius = point % 2 === 0 ? 1 : innerRatio
    const pointX = x + Math.cos(angle) * outerRadiusX * radius
    const pointY = y + Math.sin(angle) * outerRadiusY * radius
    if (point === 0) context.moveTo(pointX, pointY)
    else context.lineTo(pointX, pointY)
  }
  context.closePath()
}

function drawTimingWindows(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  travelSeconds: number,
  highwayLength: number,
  hitLineRatio: number,
): void {
  const hitWindowSeconds = HIT_WINDOW_MS / 1000
  const early = highwayPoint(
    width,
    height,
    1 - hitWindowSeconds / travelSeconds,
    highwayLength,
    hitLineRatio,
  )
  const late = highwayPoint(
    width,
    height,
    1 + hitWindowSeconds / travelSeconds,
    highwayLength,
    hitLineRatio,
  )
  context.beginPath()
  context.moveTo(trackEdge(early, -1), early.y)
  context.lineTo(trackEdge(early, 1), early.y)
  context.lineTo(trackEdge(late, 1), late.y)
  context.lineTo(trackEdge(late, -1), late.y)
  context.closePath()
  const glow = context.createLinearGradient(0, early.y, 0, late.y)
  glow.addColorStop(0, 'rgba(204, 212, 255, 0)')
  glow.addColorStop(0.5, 'rgba(204, 212, 255, 0.055)')
  glow.addColorStop(1, 'rgba(204, 212, 255, 0)')
  context.fillStyle = glow
  context.fill()
}

function drawBeatLines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: ParsedChart,
  visualTimeSeconds: number,
  travelSeconds: number,
  highwayLength: number,
  hitLineRatio: number,
): void {
  const markers = visibleBeatMarkers(
    chart,
    visualTimeSeconds - 0.2,
    visualTimeSeconds + travelSeconds,
  )

  for (const marker of markers) {
    const progress =
      1 - (marker.timeSeconds - visualTimeSeconds) / travelSeconds
    if (progress < 0 || progress > 1.14) continue
    const point = highwayPoint(
      width,
      height,
      progress,
      highwayLength,
      hitLineRatio,
    )
    const fade = Math.max(0.16, 1 - Math.max(0, progress - 0.82) * 4.5)
    context.beginPath()
    context.moveTo(trackEdge(point, -1), point.y)
    context.lineTo(trackEdge(point, 1), point.y)
    context.strokeStyle = marker.downbeat
      ? `rgba(214, 220, 229, ${0.32 * fade})`
      : `rgba(185, 192, 203, ${0.11 * fade})`
    context.lineWidth = marker.downbeat ? 2 : 1
    context.stroke()
  }
}

function drawSustainTail(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  note: ChartNote,
  render: NoteRenderState,
  visualTimeSeconds: number,
  travelSeconds: number,
  whammyAmount: number,
  starPowerActive: boolean,
  starPowerNote: boolean,
  highwayLength: number,
  hitLineRatio: number,
): void {
  if (note.sustainSeconds <= 0.03) return

  const sustainEnd = note.timeSeconds + note.sustainSeconds
  const tailProgress =
    1 - (sustainEnd - visualTimeSeconds) / travelSeconds
  const head = highwayPoint(
    width,
    height,
    render.progress,
    highwayLength,
    hitLineRatio,
  )
  const tail = highwayPoint(
    width,
    height,
    Math.max(-0.05, tailProgress),
    highwayLength,
    hitLineRatio,
  )
  const headSize = noteRadius(head)
  const lanes: Array<Lane | null> = note.open ? [null] : note.lanes
  const held = render.activeSustain && render.sustainState !== 'released'

  context.save()
  context.globalAlpha = render.depthAlpha
  for (const lane of lanes) {
    const color = starPowerActive
      ? STAR_POWER_COLOR
      : starPowerNote
      ? '#c8f2ff'
      : lane === null
        ? '#e7e9ff'
        : LANE_COLORS[lane]
    const headX =
      lane === null ? head.center : highwayLaneX(width, lane, render.progress)
    const tailX =
      lane === null ? tail.center : highwayLaneX(width, lane, tailProgress)
    const thickness =
      lane === null
        ? Math.max(9, head.trackWidth * 0.045)
        : Math.max(5, headSize * 0.42)

    context.beginPath()
    context.moveTo(tailX, tail.y)
    context.lineTo(headX, head.y)
    context.strokeStyle = 'rgba(0, 0, 0, 0.82)'
    context.lineWidth = thickness + 5
    context.lineCap = 'round'
    context.stroke()

    const beam = context.createLinearGradient(tailX, tail.y, headX, head.y)
    beam.addColorStop(0, `${color}36`)
    beam.addColorStop(0.62, `${color}b8`)
    beam.addColorStop(1, held ? color : `${color}98`)
    context.beginPath()
    context.moveTo(tailX, tail.y)
    context.lineTo(headX, head.y)
    context.strokeStyle =
      render.state === 'miss' || render.sustainState === 'released'
        ? 'rgba(112, 116, 125, 0.75)'
        : beam
    context.lineWidth = thickness
    context.shadowColor = held || starPowerNote ? color : 'transparent'
    context.shadowBlur = held ? (starPowerNote ? 22 : 14) : starPowerNote ? 9 : 0
    context.stroke()

    context.beginPath()
    context.moveTo(tailX, tail.y)
    context.lineTo(headX, head.y)
    context.strokeStyle =
      render.state === 'miss' || render.sustainState === 'released'
        ? 'rgba(205, 209, 216, 0.2)'
        : 'rgba(255, 255, 255, 0.48)'
    context.lineWidth = Math.max(1, thickness * 0.17)
    context.shadowBlur = 0
    context.stroke()

    if (held && whammyAmount >= 0.08) {
      context.save()
      context.globalCompositeOperation = 'lighter'
      context.fillStyle = '#f4fdff'
      context.shadowColor = starPowerNote ? '#65dcff' : color
      context.shadowBlur = 12 + whammyAmount * 12
      for (let spark = 0; spark < 6; spark += 1) {
        const position =
          (spark / 6 + visualTimeSeconds * (1.5 + whammyAmount)) % 1
        const x = tailX + (headX - tailX) * position
        const y = tail.y + (head.y - tail.y) * position
        const radius =
          Math.max(1.5, thickness * 0.22) *
          (0.72 + whammyAmount * 0.48)
        context.globalAlpha =
          render.depthAlpha * (0.35 + position * 0.65)
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    }
  }
  context.restore()
}

function drawChordBridge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  note: ChartNote,
  render: NoteRenderState,
  starPowerActive: boolean,
  highwayLength: number,
  tapMode: boolean,
  hitLineRatio: number,
): void {
  if (note.lanes.length < 2) return
  const positions = note.lanes.map((lane) =>
    highwayLaneX(width, lane, render.progress),
  )
  const point = highwayPoint(
    width,
    height,
    render.progress,
    highwayLength,
    hitLineRatio,
  )
  const size = noteRadius(point)
  const left = Math.min(...positions)
  const right = Math.max(...positions)
  context.save()
  context.globalAlpha = render.depthAlpha
  if (tapMode && note.lanes.length >= 3) {
    const plateHeight = Math.max(5, size * 0.5)
    context.beginPath()
    context.roundRect(
      left - size * 0.54,
      point.y - plateHeight * 0.34,
      right - left + size * 1.08,
      plateHeight,
      plateHeight * 0.5,
    )
    context.fillStyle =
      render.state === 'miss'
        ? 'rgba(66, 69, 76, 0.66)'
        : starPowerActive
          ? 'rgba(57, 201, 239, 0.6)'
          : 'rgba(224, 231, 239, 0.38)'
    context.strokeStyle =
      render.state === 'miss'
        ? 'rgba(115, 119, 127, 0.52)'
        : 'rgba(247, 251, 255, 0.82)'
    context.lineWidth = Math.max(1.5, size * 0.09)
    context.shadowColor =
      render.state === 'miss'
        ? 'transparent'
        : starPowerActive
          ? 'rgba(76, 218, 255, 0.66)'
          : 'rgba(226, 234, 243, 0.38)'
    context.shadowBlur = 10
    context.fill()
    context.stroke()
  }
  context.beginPath()
  context.moveTo(left, point.y + size * 0.2)
  context.lineTo(right, point.y + size * 0.2)
  context.strokeStyle =
    render.state === 'miss'
      ? 'rgba(92, 96, 105, 0.72)'
      : starPowerActive
        ? 'rgba(105, 224, 255, 0.9)'
        : 'rgba(220, 225, 233, 0.72)'
  context.lineWidth = Math.max(3, size * 0.25)
  context.shadowColor =
    render.state === 'miss' ? 'transparent' : 'rgba(223, 230, 242, 0.32)'
  context.shadowBlur = 6
  context.stroke()
  context.restore()
}

function drawStarPowerGem(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  note: ChartNote,
  color: string,
  darkColor: string,
  missed: boolean,
): void {
  const baseAlpha = context.globalAlpha
  const capScale = note.tap ? 0.48 : note.hopo ? 0.27 : 0.52
  const capHeight = note.tap ? 0.18 : note.hopo ? 0.1 : 0.18

  context.save()
  context.lineJoin = 'round'
  if (note.tap && !missed) {
    context.globalAlpha = baseAlpha * 0.6
  }

  // The shadow and metal underside follow the complete star silhouette so
  // this reads as a star-shaped gem rather than an icon on a round note.
  traceStar(
    context,
    x,
    y + radius * 0.34,
    radius * 1.22,
    radius * 0.77,
  )
  context.fillStyle = 'rgba(0, 0, 0, 0.78)'
  context.shadowColor = missed ? 'transparent' : `${color}70`
  context.shadowBlur = radius * 0.95
  context.fill()
  context.shadowBlur = 0

  traceStar(
    context,
    x,
    y + radius * 0.2,
    radius * 1.16,
    radius * 0.75,
  )
  context.fillStyle = ellipseGradient(
    context,
    x,
    y + radius * 0.04,
    radius * 1.18,
    missed ? '#c9cccf' : '#f8fafb',
    missed ? '#666b70' : '#777d83',
  )
  context.strokeStyle = missed
    ? 'rgba(240, 242, 244, 0.42)'
    : 'rgba(255, 255, 255, 0.88)'
  context.lineWidth = Math.max(1, radius * 0.075)
  context.fill()
  context.stroke()

  traceStar(
    context,
    x,
    y - radius * 0.015,
    radius * 1.08,
    radius * 0.69,
  )
  context.fillStyle = ellipseGradient(
    context,
    x - radius * 0.15,
    y - radius * 0.2,
    radius * 1.08,
    missed ? '#85898d' : color,
    darkColor,
  )
  context.strokeStyle = missed
    ? 'rgba(220, 223, 226, 0.38)'
    : 'rgba(223, 249, 255, 0.96)'
  context.lineWidth = Math.max(1.25, radius * 0.09)
  context.shadowColor = missed ? 'transparent' : `${color}b8`
  context.shadowBlur = radius * 0.9
  context.fill()
  context.stroke()
  context.shadowBlur = 0

  // A second star-shaped bevel adds depth without obscuring the silhouette.
  traceStar(
    context,
    x,
    y - radius * 0.09,
    radius * 0.78,
    radius * 0.47,
    0.52,
  )
  context.fillStyle = ellipseGradient(
    context,
    x - radius * 0.12,
    y - radius * 0.18,
    radius * 0.78,
    missed ? '#9a9da1' : `${color}ee`,
    missed ? '#55595d' : darkColor,
  )
  context.fill()

  context.globalAlpha = baseAlpha
  if (note.tap && !missed) {
    traceStar(
      context,
      x,
      y - radius * 0.02,
      radius * 1.1,
      radius * 0.7,
    )
    context.strokeStyle = 'rgba(201, 235, 255, 0.98)'
    context.lineWidth = Math.max(1.5, radius * 0.1)
    context.shadowColor = 'rgba(112, 210, 255, 0.98)'
    context.shadowBlur = radius * 1.2
    context.stroke()
    context.shadowBlur = 0
  }

  // Keep the familiar cap language so power notes still communicate whether
  // they are strums, HOPOs, or taps.
  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.07,
    radius * (capScale + 0.1),
    radius * (capHeight + 0.07),
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = missed ? '#5d6165' : 'rgba(13, 18, 23, 0.9)'
  context.fill()

  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.11,
    radius * capScale,
    radius * capHeight,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = missed
    ? ellipseGradient(
        context,
        x,
        y - radius * 0.14,
        radius * capScale,
        '#a0a3a6',
        '#5b5f63',
      )
    : note.hopo || note.tap
      ? ellipseGradient(
          context,
          x,
          y - radius * 0.15,
          radius * capScale,
          '#ffffff',
          note.tap ? '#b7eaff' : '#c8cdd2',
        )
      : ellipseGradient(
          context,
          x,
          y - radius * 0.12,
          radius * capScale,
          '#464d54',
          '#0b0e12',
        )
  context.strokeStyle =
    !missed && (note.hopo || note.tap)
      ? 'rgba(255, 255, 255, 0.96)'
      : 'rgba(218, 226, 232, 0.7)'
  context.lineWidth =
    note.hopo || note.tap ? Math.max(1.2, radius * 0.08) : 1
  context.shadowColor =
    !missed && (note.hopo || note.tap)
      ? note.tap
        ? 'rgba(118, 216, 255, 0.98)'
        : 'rgba(255, 255, 255, 0.92)'
      : 'transparent'
  context.shadowBlur = note.tap
    ? radius
    : note.hopo
      ? radius * 0.65
      : 0
  context.fill()
  context.stroke()
  context.shadowBlur = 0

  context.beginPath()
  context.ellipse(
    x - radius * 0.17,
    y - radius * 0.23,
    radius * 0.18,
    radius * 0.055,
    -0.18,
    0,
    Math.PI * 2,
  )
  context.fillStyle = 'rgba(255, 255, 255, 0.72)'
  context.fill()
  context.restore()
}

function drawGem(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  lane: Lane,
  note: ChartNote,
  missed: boolean,
  starPowerActive: boolean,
  starPowerNote: boolean,
): void {
  const color = missed
    ? '#62666c'
    : starPowerActive
      ? STAR_POWER_COLOR
      : LANE_COLORS[lane]
  const darkColor = missed
    ? '#34373b'
    : starPowerActive
      ? STAR_POWER_DARK_COLOR
      : `${LANE_COLORS[lane]}a8`
  const baseAlpha = context.globalAlpha

  if (starPowerNote) {
    drawStarPowerGem(
      context,
      x,
      y,
      radius,
      note,
      color,
      darkColor,
      missed,
    )
    return
  }

  context.save()
  if (note.tap && !missed) {
    context.globalAlpha = baseAlpha * 0.58
  }
  context.beginPath()
  context.ellipse(
    x,
    y + radius * 0.34,
    radius * 1.13,
    radius * 0.46,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = 'rgba(0, 0, 0, 0.72)'
  context.shadowColor = missed ? 'transparent' : `${color}55`
  context.shadowBlur = radius * 0.8
  context.fill()

  context.beginPath()
  context.ellipse(
    x,
    y + radius * 0.24,
    radius * 1.06,
    radius * 0.68,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = ellipseGradient(
    context,
    x,
    y + radius * 0.08,
    radius * 1.1,
    missed ? '#e0e2e4' : '#f6f8fa',
    missed ? '#74777b' : '#858a90',
  )
  context.fill()

  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.04,
    radius,
    radius * 0.58,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = ellipseGradient(
    context,
    x,
    y,
    radius,
    missed ? '#777b80' : color,
    darkColor,
  )
  context.shadowColor = missed ? 'transparent' : `${color}99`
  context.shadowBlur = radius * 0.7
  context.fill()
  context.shadowBlur = 0

  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.11,
    radius * 0.74,
    radius * 0.33,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = missed
    ? '#484b50'
    : ellipseGradient(
        context,
        x,
        y - radius * 0.14,
        radius * 0.74,
        color,
        darkColor,
      )
  context.fill()

  context.globalAlpha = baseAlpha

  if (note.tap && !missed) {
    context.beginPath()
    context.ellipse(
      x,
      y - radius * 0.04,
      radius * 1.04,
      radius * 0.61,
      0,
      0,
      Math.PI * 2,
    )
    context.strokeStyle = 'rgba(201, 235, 255, 0.96)'
    context.lineWidth = Math.max(1.5, radius * 0.105)
    context.shadowColor = 'rgba(132, 214, 255, 0.95)'
    context.shadowBlur = radius * 1.15
    context.stroke()
    context.shadowBlur = 0
  }

  const capScale = note.tap ? 0.5 : note.hopo ? 0.28 : 0.58
  const capHeight = note.tap ? 0.19 : note.hopo ? 0.105 : 0.2
  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.3,
    radius * capScale,
    radius * capHeight,
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle =
    missed
      ? ellipseGradient(
          context,
          x,
          y - radius * 0.32,
          radius * capScale,
          '#9da0a4',
          '#5e6267',
        )
      : note.hopo || note.tap
        ? ellipseGradient(
            context,
            x,
            y - radius * 0.32,
            radius * capScale,
            '#ffffff',
            note.tap ? '#b9e8ff' : '#c6cbd0',
          )
        : ellipseGradient(
            context,
            x,
            y - radius * 0.28,
            radius * capScale,
            '#454b53',
            '#101318',
          )
  context.strokeStyle = missed
    ? 'rgba(255, 255, 255, 0.32)'
    : note.tap
      ? 'rgba(225, 245, 255, 0.98)'
      : note.hopo
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(213, 221, 228, 0.72)'
  context.lineWidth =
    note.tap || note.hopo ? Math.max(1.25, radius * 0.085) : 1
  context.shadowColor =
    !missed && (note.tap || note.hopo)
      ? note.tap
        ? 'rgba(138, 220, 255, 0.98)'
        : 'rgba(255, 255, 255, 0.92)'
      : 'transparent'
  context.shadowBlur = note.tap
    ? radius * 0.95
    : note.hopo
      ? radius * 0.7
      : 0
  context.fill()
  context.stroke()
  context.shadowBlur = 0

  context.restore()
}

function drawOpenGem(
  context: CanvasRenderingContext2D,
  point: HighwayPoint,
  size: number,
  note: ChartNote,
  missed: boolean,
  starPowerActive: boolean,
  starPowerNote: boolean,
): void {
  const barWidth = point.trackWidth * 0.68
  const barHeight = Math.max(
    7,
    size * (note.tap ? 0.55 : note.hopo ? 0.48 : 0.72),
  )
  const baseAlpha = context.globalAlpha
  context.save()
  if (note.tap && !missed) {
    context.globalAlpha = baseAlpha * 0.58
  }
  context.beginPath()
  context.roundRect(
    point.center - barWidth / 2,
    point.y - barHeight / 2,
    barWidth,
    barHeight,
    barHeight / 2,
  )
  context.fillStyle = missed
    ? '#696d75'
    : starPowerActive
      ? ellipseGradient(
          context,
          point.center,
          point.y,
          barWidth * 0.45,
          '#b8f4ff',
          STAR_POWER_DARK_COLOR,
        )
    : ellipseGradient(
        context,
        point.center,
        point.y,
        barWidth * 0.45,
        note.hopo || note.tap ? '#f7ecff' : '#c88aff',
        note.tap ? '#7fd9ff' : '#6d2ca5',
      )
  context.shadowColor = missed
    ? 'transparent'
    : starPowerActive
      ? 'rgba(80, 218, 255, 0.94)'
      : 'rgba(180, 100, 255, 0.82)'
  context.shadowBlur = size * 0.9
  context.fill()
  context.shadowBlur = 0

  context.globalAlpha = baseAlpha
  context.strokeStyle = missed
    ? 'rgba(255,255,255,0.25)'
    : note.tap
      ? 'rgba(180, 231, 255, 0.98)'
      : note.hopo
        ? 'rgba(255, 255, 255, 0.94)'
        : 'rgba(224, 190, 255, 0.82)'
  context.lineWidth =
    note.hopo || note.tap ? Math.max(2, size * 0.13) : Math.max(1, size * 0.07)
  context.shadowColor =
    !missed && (note.hopo || note.tap)
      ? note.tap
        ? 'rgba(112, 210, 255, 0.95)'
        : 'rgba(255, 255, 255, 0.84)'
      : 'transparent'
  context.shadowBlur = note.tap ? size * 1.25 : note.hopo ? size * 0.72 : 0
  context.stroke()

  if (starPowerNote && !missed) {
    traceStar(
      context,
      point.center,
      point.y,
      size * 0.5,
      size * 0.34,
    )
    context.fillStyle = 'rgba(238, 252, 255, 0.92)'
    context.strokeStyle = STAR_POWER_COLOR
    context.lineJoin = 'round'
    context.lineWidth = Math.max(1.5, size * 0.08)
    context.shadowColor = '#72dfff'
    context.shadowBlur = size * 1.25
    context.fill()
    context.stroke()
    context.shadowBlur = 0
  }
  context.restore()
}

function activeSustainLanes(
  chart: ParsedChart,
  frame: GameFrame,
): Set<Lane> {
  const lanes = new Set<Lane>()
  const candidates =
    frame.activeSustainIndices ??
    chart.notes.map((_, noteIndex) => noteIndex)
  for (const index of candidates) {
    const note = chart.notes[index]
    if (!note) continue
    if (
      frame.noteStates[index] === 'hit' &&
      frame.sustainStates[index] === 'holding' &&
      note.timeSeconds + note.sustainSeconds > frame.visualTimeSeconds
    ) {
      note.lanes.forEach((lane) => lanes.add(lane))
    }
  }
  return lanes
}

function drawStrikeLineAndReceptors(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  sustainingLanes: Set<Lane>,
  highwayLength: number,
  hitLineRatio: number,
  tapMode: boolean,
): void {
  const bottom = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )

  context.beginPath()
  context.moveTo(trackEdge(bottom, -1), bottom.hitY)
  context.lineTo(trackEdge(bottom, 1), bottom.hitY)
  context.strokeStyle = 'rgba(228, 232, 237, 0.58)'
  context.lineWidth = 3
  context.shadowColor = 'rgba(206, 220, 255, 0.48)'
  context.shadowBlur = 10
  context.stroke()
  context.shadowBlur = 0

  for (let laneNumber = 0; laneNumber < 5; laneNumber += 1) {
    const lane = laneNumber as Lane
    const held = frame.heldLanes.includes(lane)
    const sustaining = sustainingLanes.has(lane)
    const impacting =
      frame.hitFlash?.open === false && frame.hitFlash.lanes.includes(lane)
    const x = highwayLaneX(width, lane, 1)
    const radius = receptorRadius(bottom)
    const press = held || impacting ? radius * 0.1 : 0
    const y = bottom.hitY + press
    const color = LANE_COLORS[lane]

    context.save()
    if (tapMode && !held && !sustaining && !impacting) {
      context.globalAlpha = 0.52
    }
    context.beginPath()
    context.ellipse(
      x,
      y + radius * 0.18,
      radius * 1.15,
      radius * 0.54,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(0, 0, 0, 0.86)'
    context.fill()

    context.beginPath()
    context.ellipse(
      x,
      y,
      radius * 1.07,
      radius * 0.56,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = ellipseGradient(
      context,
      x,
      y,
      radius,
      '#e5e9ed',
      '#676d73',
    )
    context.fill()

    context.beginPath()
    context.ellipse(
      x,
      y - radius * 0.05,
      radius,
      radius * 0.48,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = color
    context.shadowColor = sustaining || impacting ? color : `${color}66`
    context.shadowBlur = sustaining || impacting ? 24 : 9
    context.fill()
    context.shadowBlur = 0

    context.beginPath()
    context.ellipse(
      x,
      y - radius * 0.07,
      radius * 0.72,
      radius * 0.32,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle =
      held || impacting
        ? ellipseGradient(context, x, y, radius, color, `${color}99`)
        : ellipseGradient(context, x, y, radius, '#30343a', '#08090b')
    context.fill()

    context.beginPath()
    context.ellipse(
      x - radius * 0.14,
      y - radius * 0.19,
      radius * 0.28,
      radius * 0.08,
      -0.08,
      0,
      Math.PI * 2,
    )
    context.fillStyle =
      held || impacting
        ? 'rgba(255,255,255,0.48)'
        : 'rgba(255,255,255,0.16)'
    context.fill()
    context.restore()
  }
}

function drawTapControlDeck(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  highwayLength: number,
  hitLineRatio: number,
  frame: GameFrame,
): void {
  const strike = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )
  const end = highwayPoint(
    width,
    height,
    1.18,
    highwayLength,
    hitLineRatio,
  )

  context.save()
  trackPath(context, strike, end)
  const deck = context.createLinearGradient(
    0,
    strike.hitY,
    0,
    end.y,
  )
  deck.addColorStop(0, 'rgba(5, 8, 14, 0.12)')
  deck.addColorStop(0.18, 'rgba(5, 8, 14, 0.34)')
  deck.addColorStop(1, 'rgba(2, 3, 7, 0.7)')
  context.fillStyle = deck
  context.fill()
  context.clip()

  const control = highwayPoint(
    width,
    height,
    1.14,
    highwayLength,
    hitLineRatio,
  )
  const whammyAmount = frame.whammyAmount

  for (const lane of frame.heldLanes) {
    const color = LANE_COLORS[lane]
    const startX = highwayLaneX(width, lane, 1)
    const controlX = highwayLaneX(width, lane, 1.14)

    context.save()
    context.globalCompositeOperation = 'lighter'
    context.globalAlpha = 0.16 + whammyAmount * 0.68
    context.beginPath()
    context.moveTo(startX, strike.hitY)
    context.lineTo(controlX, control.y)
    context.strokeStyle = color
    context.lineWidth = 3 + whammyAmount * 7
    context.lineCap = 'round'
    context.shadowColor = color
    context.shadowBlur = 10 + whammyAmount * 24
    context.stroke()

    if (whammyAmount > 0.01) {
      context.globalAlpha = 0.34 + whammyAmount * 0.54
      context.setLineDash([7, 13])
      context.lineDashOffset = -frame.songTimeSeconds * 110
      context.beginPath()
      context.moveTo(controlX, control.y)
      context.lineTo(startX, strike.hitY)
      context.strokeStyle = 'rgba(245, 252, 255, 0.96)'
      context.lineWidth = 1.5 + whammyAmount * 2.5
      context.shadowColor = color
      context.shadowBlur = 14 + whammyAmount * 18
      context.stroke()
    }
    context.restore()
  }

  context.restore()
}

function drawHitEffects(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  highwayLength: number,
  hitLineRatio: number,
): void {
  if (!frame.hitFlash) return
  const duration = Math.max(
    0.001,
    frame.hitFlash.expiresAt - frame.hitFlash.startedAt,
  )
  const impactProgress = Math.max(
    0,
    Math.min(
      1,
      (frame.songTimeSeconds - frame.hitFlash.startedAt) / duration,
    ),
  )
  const bottom = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )
  const opacity = Math.pow(1 - impactProgress, 1.15)
  const radius = receptorRadius(bottom)
  const phraseFlash = frame.starPowerPhraseFlash
  const phraseCompletionHit =
    phraseFlash !== null &&
    phraseFlash !== undefined &&
    Math.abs(phraseFlash.startedAt - frame.hitFlash.startedAt) < 0.001
  if (phraseCompletionHit) return

  const fireImage = gameplayVfxImage(HIT_FIRE_ATLAS)
  if (fireImage && !frame.hitFlash.open) {
    const fireWidth = radius * 3.05
    const fireHeight = fireWidth * (256 / 192)
    const impactXs = frame.hitFlash.lanes.map((lane) =>
      highwayLaneX(width, lane, 1),
    )

    context.save()
    context.globalAlpha =
      1 - Math.max(0, (impactProgress - 0.82) / 0.18)
    context.globalCompositeOperation = 'screen'
    for (const centerX of impactXs) {
      drawSpriteFrame(
        context,
        fireImage,
        HIT_FIRE_ATLAS,
        impactProgress,
        {
          centerX,
          anchorY: bottom.hitY,
          width: fireWidth,
          height: fireHeight,
        },
      )
    }
    context.restore()
    return
  }

  context.save()
  context.globalAlpha = opacity
  context.globalCompositeOperation = 'lighter'

  if (frame.hitFlash.open) {
    const lift = Math.sin(impactProgress * Math.PI) * radius * 0.38
    const barWidth =
      bottom.trackWidth * (0.72 + impactProgress * 0.12)
    const barHeight = radius * (0.68 - impactProgress * 0.14)
    const barY = bottom.hitY - lift

    const curtain = context.createLinearGradient(
      0,
      barY - radius * 3.8,
      0,
      barY + radius * 0.3,
    )
    curtain.addColorStop(0, 'rgba(164, 179, 255, 0)')
    curtain.addColorStop(0.58, 'rgba(192, 205, 255, 0.13)')
    curtain.addColorStop(1, 'rgba(244, 247, 255, 0.72)')
    context.beginPath()
    context.moveTo(
      bottom.center - barWidth * 0.36,
      barY - radius * 3.5,
    )
    context.lineTo(bottom.center + barWidth * 0.36, barY - radius * 3.5)
    context.lineTo(bottom.center + barWidth / 2, barY)
    context.lineTo(bottom.center - barWidth / 2, barY)
    context.closePath()
    context.fillStyle = curtain
    context.fill()

    const openBloom = context.createRadialGradient(
      bottom.center,
      barY,
      0,
      bottom.center,
      barY,
      barWidth * 0.58,
    )
    openBloom.addColorStop(0, 'rgba(255,255,255,0.94)')
    openBloom.addColorStop(0.18, 'rgba(202,213,255,0.66)')
    openBloom.addColorStop(1, 'rgba(133,151,255,0)')
    context.beginPath()
    context.ellipse(
      bottom.center,
      barY,
      barWidth * 0.58,
      radius * (1.1 + impactProgress),
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = openBloom
    context.fill()

    const barGradient = context.createLinearGradient(
      0,
      barY - barHeight / 2,
      0,
      barY + barHeight / 2,
    )
    barGradient.addColorStop(0, '#ffffff')
    barGradient.addColorStop(0.42, '#e9edff')
    barGradient.addColorStop(1, '#8698f2')
    context.beginPath()
    context.roundRect(
      bottom.center - barWidth / 2,
      barY - barHeight / 2,
      barWidth,
      barHeight,
      barHeight,
    )
    context.fillStyle = barGradient
    context.shadowColor = '#d9e0ff'
    context.shadowBlur = 42
    context.fill()
    context.shadowBlur = 0
    context.strokeStyle = '#ffffff'
    context.lineWidth = Math.max(2, radius * 0.08)
    context.stroke()

    for (let ring = 0; ring < 2; ring += 1) {
      const ringProgress = Math.min(
        1,
        impactProgress + ring * 0.18,
      )
      const ringWidth =
        bottom.trackWidth * (0.74 + ringProgress * 0.24)
      context.beginPath()
      context.roundRect(
        bottom.center - ringWidth / 2,
        bottom.hitY - barHeight * (0.7 + ringProgress),
        ringWidth,
        barHeight * (1.4 + ringProgress * 1.4),
        barHeight,
      )
      context.strokeStyle =
        ring === 0
          ? 'rgba(255,255,255,0.82)'
          : 'rgba(151,169,255,0.48)'
      context.lineWidth = Math.max(1.5, radius * 0.05)
      context.stroke()
    }

    for (let spark = 0; spark < 9; spark += 1) {
      const sparkX =
        bottom.center - barWidth * 0.43 + (barWidth * 0.86 * spark) / 8
      const sparkHeight =
        radius * (0.7 + ((spark * 5) % 4) * 0.25) *
        (0.7 + impactProgress * 1.6)
      context.beginPath()
      context.moveTo(sparkX, barY)
      context.lineTo(
        sparkX + ((spark % 3) - 1) * radius * 0.16,
        barY - sparkHeight,
      )
      context.strokeStyle =
        spark % 2 === 0 ? '#ffffff' : 'rgba(153,171,255,0.9)'
      context.lineWidth = Math.max(1, radius * 0.055)
      context.stroke()
    }
  } else {
    for (const lane of frame.hitFlash.lanes) {
      const x = highwayLaneX(width, lane, 1)
      const color = frame.stats.starPowerActive
        ? STAR_POWER_COLOR
        : LANE_COLORS[lane]
      const lift = Math.sin(impactProgress * Math.PI) * radius * 0.42
      const impactY = bottom.hitY - lift
      const bloomRadius = radius * (1.35 + impactProgress * 1.85)

      const plume = context.createLinearGradient(
        0,
        impactY - radius * 3.6,
        0,
        impactY + radius * 0.25,
      )
      plume.addColorStop(0, `${color}00`)
      plume.addColorStop(0.52, `${color}3d`)
      plume.addColorStop(1, '#ffffff')
      context.beginPath()
      context.moveTo(x - radius * 0.62, impactY)
      context.quadraticCurveTo(
        x - radius * 0.42,
        impactY - radius * 2.1,
        x,
        impactY - radius * (3.2 + impactProgress),
      )
      context.quadraticCurveTo(
        x + radius * 0.42,
        impactY - radius * 2.1,
        x + radius * 0.62,
        impactY,
      )
      context.closePath()
      context.fillStyle = plume
      context.fill()

      const bloom = context.createRadialGradient(
        x,
        impactY,
        0,
        x,
        impactY,
        bloomRadius,
      )
      bloom.addColorStop(0, 'rgba(255,255,255,0.94)')
      bloom.addColorStop(0.18, color)
      bloom.addColorStop(1, `${color}00`)
      context.beginPath()
      context.ellipse(
        x,
        impactY,
        bloomRadius,
        bloomRadius * 0.68,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = bloom
      context.fill()

      const coreScale = 1.34 - impactProgress * 0.28
      context.beginPath()
      context.ellipse(
        x,
        impactY,
        radius * coreScale,
        radius * coreScale * 0.52,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = color
      context.shadowColor = color
      context.shadowBlur = radius * 1.3
      context.fill()
      context.shadowBlur = 0

      context.beginPath()
      context.ellipse(
        x,
        impactY - radius * 0.12,
        radius * coreScale * 0.62,
        radius * coreScale * 0.23,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = 'rgba(255,255,255,0.94)'
      context.fill()

      context.beginPath()
      context.ellipse(
        x,
        bottom.hitY,
        radius * (1.15 + impactProgress * 1.8),
        radius * (0.58 + impactProgress * 0.82),
        0,
        0,
        Math.PI * 2,
      )
      context.strokeStyle = `${color}d6`
      context.lineWidth = Math.max(1.5, radius * 0.075)
      context.stroke()

      for (let spark = 0; spark < 11; spark += 1) {
        const angle = -Math.PI * 0.96 + (spark / 10) * Math.PI * 0.92
        const distance =
          radius * (0.7 + impactProgress * (1.8 + spark * 0.09))
        const startX = x + Math.cos(angle) * radius * 0.42
        const startY = impactY + Math.sin(angle) * radius * 0.32
        context.beginPath()
        context.moveTo(startX, startY)
        context.lineTo(
          x + Math.cos(angle) * distance,
          impactY + Math.sin(angle) * distance,
        )
        context.strokeStyle = spark % 2 === 0 ? '#ffffff' : color
        context.lineWidth = Math.max(1, radius * 0.065)
        context.stroke()
      }
    }
  }
  context.restore()
}

function drawStarPowerPhraseCompletion(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  highwayLength: number,
  hitLineRatio: number,
): void {
  const flash = frame.starPowerPhraseFlash
  if (!flash) return
  const duration = Math.max(0.001, flash.expiresAt - flash.startedAt)
  const progress = Math.max(
    0,
    Math.min(1, (frame.songTimeSeconds - flash.startedAt) / duration),
  )
  const bottom = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )
  const radius = receptorRadius(bottom)
  const impactX = flash.open
    ? bottom.center
    : flash.lanes.reduce<number>(
        (sum, lane) => sum + highwayLaneX(width, lane, 1),
        0,
      ) / Math.max(1, flash.lanes.length)
  const lightningImage = gameplayVfxImage(
    STAR_POWER_LIGHTNING_ATLAS,
  )

  context.save()
  context.globalAlpha = 1 - Math.max(0, (progress - 0.84) / 0.16)
  context.globalCompositeOperation = 'screen'

  if (lightningImage) {
    const lightningWidth = Math.min(
      bottom.trackWidth * 0.39,
      radius * 8.25,
    )
    const lightningHeight = Math.min(
      height * 0.82,
      (bottom.hitY - height * 0.025) /
        STAR_POWER_LIGHTNING_ATLAS.anchorY,
    )
    drawSpriteFrame(
      context,
      lightningImage,
      STAR_POWER_LIGHTNING_ATLAS,
      progress,
      {
        centerX: impactX,
        anchorY: bottom.hitY,
        width: lightningWidth,
        height: lightningHeight,
      },
    )
  } else {
    context.beginPath()
    context.moveTo(impactX, height * 0.03)
    context.lineTo(impactX - radius * 0.4, height * 0.36)
    context.lineTo(impactX + radius * 0.24, height * 0.58)
    context.lineTo(impactX, bottom.hitY)
    context.strokeStyle = '#dffaff'
    context.lineWidth = Math.max(3, radius * 0.18)
    context.shadowColor = '#32c9ff'
    context.shadowBlur = radius * 1.5
    context.stroke()
  }

  context.restore()
}

function drawCountdown(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  songTimeSeconds: number,
): void {
  const cue = countdownCue(songTimeSeconds)
  if (!cue) return
  const cueScale = 1.14 - cue.progress * 0.14
  const cueAlpha =
    cue.label === 'GO!' ? 1 - cue.progress * 0.55 : 1 - cue.progress * 0.3
  context.save()
  context.translate(width / 2, height * 0.38)
  context.scale(cueScale, cueScale)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `900 ${Math.min(112, width * 0.18)}px system-ui, sans-serif`
  context.fillStyle = `rgba(242, 244, 255, ${cueAlpha})`
  context.shadowColor =
    cue.label === 'GO!'
      ? 'rgba(91, 214, 111, 0.95)'
      : 'rgba(142, 152, 255, 0.95)'
  context.shadowBlur = 28
  context.fillText(cue.label, 0, 0)
  context.restore()
}

function drawMissFeedback(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  highwayLength: number,
  hitLineRatio: number,
): void {
  const miss = frame.missFlash
  if (!miss) return
  const duration = Math.max(0.001, miss.expiresAt - miss.startedAt)
  const progress = Math.max(
    0,
    Math.min(1, (frame.songTimeSeconds - miss.startedAt) / duration),
  )
  const alpha = 1 - progress
  const point = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )
  const radius = receptorRadius(point)

  context.save()
  context.globalAlpha = alpha
  context.strokeStyle = '#ff4051'
  context.fillStyle = '#ff7380'
  context.shadowColor = '#ff233b'
  context.shadowBlur = 16 * alpha
  context.lineWidth = Math.max(2, radius * 0.09)

  if (miss.open) {
    context.beginPath()
    context.roundRect(
      trackEdge(point, -1) + radius * 0.25,
      point.hitY - radius * 0.25,
      point.trackWidth - radius * 0.5,
      radius * 0.5,
      radius * 0.2,
    )
    context.stroke()
  } else {
    for (const lane of miss.lanes) {
      const x = highwayLaneX(width, lane, 1)
      context.beginPath()
      context.ellipse(
        x,
        point.hitY,
        radius * (1.08 + progress * 0.32),
        radius * (0.58 + progress * 0.18),
        0,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }
  }

  context.shadowBlur = 10 * alpha
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `850 ${Math.max(12, Math.min(18, width * 0.018))}px system-ui, sans-serif`
  context.fillText('MISS', width / 2, point.hitY - radius * 1.65)
  context.restore()
}

function drawHighwayHorizonFade(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  highwayLength: number,
  hitLineRatio: number,
  starPowerActive: boolean,
): void {
  const horizon = highwayPoint(
    width,
    height,
    0,
    highwayLength,
    hitLineRatio,
  )
  const fadeEnd = highwayPoint(
    width,
    height,
    0.28,
    highwayLength,
    hitLineRatio,
  )
  const maskTopY = Math.max(
    0,
    horizon.y - Math.max(64, height * 0.1),
  )
  const topPadding = 36
  const endPadding = 10

  context.save()
  context.beginPath()
  context.moveTo(trackEdge(horizon, -1) - topPadding, maskTopY)
  context.lineTo(trackEdge(horizon, 1) + topPadding, maskTopY)
  context.lineTo(trackEdge(fadeEnd, 1) + endPadding, fadeEnd.y)
  context.lineTo(trackEdge(fadeEnd, -1) - endPadding, fadeEnd.y)
  context.closePath()

  const fade = context.createLinearGradient(
    0,
    horizon.y - 2,
    0,
    fadeEnd.y,
  )
  const horizonColor = starPowerActive
    ? 'rgba(2, 12, 20, 1)'
    : 'rgba(2, 3, 7, 1)'
  fade.addColorStop(0, horizonColor)
  fade.addColorStop(0.24, horizonColor)
  fade.addColorStop(
    0.62,
    starPowerActive
      ? 'rgba(2, 12, 20, 0.42)'
      : 'rgba(2, 3, 7, 0.42)',
  )
  fade.addColorStop(1, 'rgba(2, 3, 7, 0)')
  context.fillStyle = fade
  context.fill()
  context.restore()
}

function drawStarPowerIgnition(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  highwayLength: number,
  hitLineRatio: number,
): void {
  const flash = frame.starPowerFlash
  if (!flash) return

  const duration = flash.expiresAt - flash.startedAt
  if (duration <= 0) return
  const progress = Math.max(
    0,
    Math.min(1, (frame.songTimeSeconds - flash.startedAt) / duration),
  )
  const intensity = Math.sin(Math.PI * progress)
  const reach = 1 - Math.pow(1 - Math.min(1, progress * 1.65), 3)
  const strike = highwayPoint(
    width,
    height,
    1,
    highwayLength,
    hitLineRatio,
  )
  const strikeHalfWidth =
    (trackEdge(strike, 1) - trackEdge(strike, -1)) / 2

  context.save()
  context.globalCompositeOperation = 'screen'

  const bloomRadius = Math.max(width, height) * (0.12 + progress * 0.22)
  const bloom = context.createRadialGradient(
    width / 2,
    strike.y,
    0,
    width / 2,
    strike.y,
    bloomRadius,
  )
  bloom.addColorStop(0, `rgba(164, 240, 255, ${0.28 * intensity})`)
  bloom.addColorStop(0.3, `rgba(44, 196, 255, ${0.16 * intensity})`)
  bloom.addColorStop(1, 'rgba(18, 125, 255, 0)')
  context.fillStyle = bloom
  context.fillRect(0, 0, width, height)

  const segments = 13
  for (const side of [-1, 1] as const) {
    context.beginPath()
    for (let segment = 0; segment <= segments; segment += 1) {
      const segmentRatio = segment / segments
      const depth = 1 - reach * segmentRatio
      const point = highwayPoint(
        width,
        height,
        depth,
        highwayLength,
        hitLineRatio,
      )
      const jitter =
        Math.sin(segment * 8.17 + flash.startedAt * 19 + side * 1.7) *
        width *
        0.0045 *
        (0.35 + segmentRatio)
      const x = trackEdge(point, side) - side * width * 0.006 + jitter
      if (segment === 0) context.moveTo(x, point.y)
      else context.lineTo(x, point.y)
    }
    context.strokeStyle = `rgba(65, 204, 255, ${0.52 * intensity})`
    context.lineWidth = Math.max(3, width * 0.005)
    context.shadowColor = '#5ce6ff'
    context.shadowBlur = 22
    context.stroke()

    context.strokeStyle = `rgba(225, 252, 255, ${0.88 * intensity})`
    context.lineWidth = Math.max(1, width * 0.0016)
    context.shadowBlur = 8
    context.stroke()
  }

  context.beginPath()
  context.ellipse(
    width / 2,
    strike.y,
    strikeHalfWidth * (0.22 + progress * 1.05),
    Math.max(5, height * (0.008 + progress * 0.025)),
    0,
    0,
    Math.PI * 2,
  )
  context.strokeStyle = `rgba(203, 249, 255, ${0.7 * (1 - progress)})`
  context.lineWidth = Math.max(2, width * 0.003)
  context.shadowColor = '#5ce6ff'
  context.shadowBlur = 18
  context.stroke()
  context.restore()
}

export function drawHighway(
  canvas: HTMLCanvasElement,
  chart: ParsedChart,
  frame: GameFrame,
  noteSpeed = 12,
  highwayLength = DEFAULT_HIGHWAY_LENGTH,
  visuals: HighwayVisualOptions = {},
): void {
  const context = resizeHighwayCanvas(canvas)
  if (!context) return

  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const travelSeconds = travelSecondsForNoteSpeed(noteSpeed)
  const tapMode = visuals.tapMode === true
  const hitLineRatio = tapMode
    ? TAP_HIT_LINE_RATIO
    : DEFAULT_HIT_LINE_RATIO

  const backgroundImage = visuals.backgroundImage ?? null
  const backgroundDim = visuals.backgroundDim ?? 42
  const highwayImage = visuals.highwayImage ?? null
  const highwayOpacity = visuals.highwayOpacity ?? 72
  const staticSurface = cachedHighwaySurface(
    canvas,
    width,
    height,
    frame.stats.starPowerActive,
    highwayLength,
    backgroundImage,
    backgroundDim,
    highwayImage,
    highwayOpacity,
    hitLineRatio,
  )
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(staticSurface, 0, 0)
  context.restore()
  drawHighwaySurfaceOverlay(
    context,
    width,
    height,
    frame.stats.starPowerActive,
    frame.songTimeSeconds,
    highwayLength,
    hitLineRatio,
  )
  if (tapMode) {
    drawTapControlDeck(
      context,
      width,
      height,
      highwayLength,
      hitLineRatio,
      frame,
    )
  }
  drawTimingWindows(
    context,
    width,
    height,
    travelSeconds,
    highwayLength,
    hitLineRatio,
  )
  drawBeatLines(
    context,
    width,
    height,
    chart,
    frame.visualTimeSeconds,
    travelSeconds,
    highwayLength,
    hitLineRatio,
  )

  const noteRenders = visibleNoteIndices(chart, frame, travelSeconds)
    .map((noteIndex) => ({
      noteIndex,
      note: chart.notes[noteIndex],
      starPowerNote: shouldRenderStarPowerNote(
        chart.notes[noteIndex],
        frame,
      ),
      render: noteRenderState(
        chart.notes[noteIndex],
        noteIndex,
        frame,
        travelSeconds,
      ),
    }))
    .filter(
      (
        entry,
      ): entry is typeof entry & { render: NoteRenderState } =>
        entry.render !== null,
    )

  if (tapMode) {
    drawTapSweepPaths(
      context,
      width,
      height,
      chart,
      frame,
      noteRenders,
      travelSeconds,
      highwayLength,
      hitLineRatio,
      LANE_COLORS,
      STAR_POWER_COLOR,
    )
  }

  for (const { note, render, starPowerNote } of noteRenders) {
    drawSustainTail(
      context,
      width,
      height,
      note,
      render,
      frame.visualTimeSeconds,
      travelSeconds,
      frame.whammyAmount,
      frame.stats.starPowerActive,
      starPowerNote,
      highwayLength,
      hitLineRatio,
    )
  }

  drawStrikeLineAndReceptors(
    context,
    width,
    height,
    frame,
    activeSustainLanes(chart, frame),
    highwayLength,
    hitLineRatio,
    tapMode,
  )

  for (const { note, render, starPowerNote } of noteRenders) {
    if (render.activeSustain) continue
    const point = highwayPoint(
      width,
      height,
      render.progress,
      highwayLength,
      hitLineRatio,
    )
    const size = noteRadius(point)
    context.save()
    context.globalAlpha = render.depthAlpha

    if (note.open) {
      drawOpenGem(
        context,
        point,
        size,
        note,
        render.state === 'miss',
        frame.stats.starPowerActive,
        starPowerNote,
      )
    } else {
      drawChordBridge(
        context,
        width,
        height,
        note,
        render,
        frame.stats.starPowerActive,
        highwayLength,
        tapMode,
        hitLineRatio,
      )
      for (const lane of note.lanes) {
        drawGem(
          context,
          highwayLaneX(width, lane, render.progress),
          point.y,
          size,
          lane,
          note,
          render.state === 'miss',
          frame.stats.starPowerActive,
          starPowerNote,
        )
      }
    }
    context.restore()
  }
  drawHitEffects(
    context,
    width,
    height,
    frame,
    highwayLength,
    hitLineRatio,
  )
  drawStarPowerPhraseCompletion(
    context,
    width,
    height,
    frame,
    highwayLength,
    hitLineRatio,
  )
  drawStarPowerIgnition(
    context,
    width,
    height,
    frame,
    highwayLength,
    hitLineRatio,
  )
  if (visuals.missFeedback !== false) {
    drawMissFeedback(
      context,
      width,
      height,
      frame,
      highwayLength,
      hitLineRatio,
    )
  }
  drawHighwayHorizonFade(
    context,
    width,
    height,
    highwayLength,
    hitLineRatio,
    frame.stats.starPowerActive,
  )
  drawCountdown(context, width, height, frame.songTimeSeconds)

  const songProgress = Math.max(
    0,
    Math.min(1, frame.songTimeSeconds / chart.durationSeconds),
  )
  context.fillStyle = 'rgba(255, 255, 255, 0.12)'
  context.fillRect(0, height - 4, width, 4)
  context.fillStyle = '#8b95ff'
  context.fillRect(0, height - 4, width * songProgress, 4)
}
