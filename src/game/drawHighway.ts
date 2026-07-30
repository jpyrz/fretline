import type {
  ChartNote,
  GameFrame,
  Lane,
  ParsedChart,
  SustainState,
} from '../types/game'
import { HIT_WINDOW_MS } from '../lib/scoring'
import { countdownCue } from './playbackTimeline'

const LANE_COLORS = ['#36d65b', '#f23b45', '#f4db2d', '#278de8', '#f28a22']
const STAR_POWER_COLOR = '#37cfff'
const STAR_POWER_DARK_COLOR = '#167aa8'

interface BeatMarker {
  timeSeconds: number
  downbeat: boolean
}

interface HighwayPoint {
  y: number
  center: number
  trackWidth: number
  hitY: number
  topY: number
}

interface NoteRenderState {
  state: GameFrame['noteStates'][number]
  sustainState: SustainState
  activeSustain: boolean
  progress: number
  depthAlpha: number
}

const MAX_HIGHWAY_WIDTH = 760
const PERSPECTIVE_POWER = 1.68
// Draw the road well beyond the visible canvas. This keeps the highway,
// lane guides, and side rails continuous below the receptor row even on
// unusually tall or high-DPI displays.
const SURFACE_END_PROGRESS = 1.18

export function travelSecondsForNoteSpeed(noteSpeed: number): number {
  const normalizedSpeed = Math.max(6, Math.min(18, noteSpeed))
  return 3 - normalizedSpeed * 0.1
}

export function projectHighwayProgress(progress: number): number {
  const bounded = Math.max(-0.08, Math.min(1.16, progress))
  if (bounded <= 1) {
    return (
      Math.sign(bounded) *
      Math.pow(Math.abs(bounded), PERSPECTIVE_POWER)
    )
  }
  return 1 + (bounded - 1) * PERSPECTIVE_POWER
}

export function highwayTrackWidth(
  viewportWidth: number,
  progress: number,
): number {
  const bottomWidth = Math.min(viewportWidth * 0.88, MAX_HIGHWAY_WIDTH)
  const topWidth = bottomWidth * 0.26
  const depth = Math.max(0, projectHighwayProgress(progress))
  return topWidth + (bottomWidth - topWidth) * depth
}

function highwayPoint(
  width: number,
  height: number,
  progress: number,
): HighwayPoint {
  const topY = height * 0.04
  const hitY = height * 0.89
  const projected = projectHighwayProgress(progress)
  const center = width / 2
  const trackWidth = highwayTrackWidth(width, progress)

  return {
    y: topY + projected * (hitY - topY),
    center,
    trackWidth,
    hitY,
    topY,
  }
}

function noteRadius(point: HighwayPoint): number {
  return Math.max(6, Math.min(42, (point.trackWidth / 5) * 0.26))
}

function receptorRadius(point: HighwayPoint): number {
  return Math.max(16, Math.min(48, (point.trackWidth / 5) * 0.31))
}

export function highwayLaneX(
  viewportWidth: number,
  lane: Lane,
  progress: number,
): number {
  const trackWidth = highwayTrackWidth(viewportWidth, progress)
  const laneWidth = trackWidth / 5
  return viewportWidth / 2 - trackWidth / 2 + laneWidth * (lane + 0.5)
}

function trackEdge(point: HighwayPoint, side: -1 | 1): number {
  return point.center + (point.trackWidth / 2) * side
}

function trackPath(
  context: CanvasRenderingContext2D,
  top: HighwayPoint,
  bottom: HighwayPoint,
): void {
  context.beginPath()
  context.moveTo(trackEdge(top, -1), top.y)
  context.lineTo(trackEdge(top, 1), top.y)
  context.lineTo(trackEdge(bottom, 1), bottom.y)
  context.lineTo(trackEdge(bottom, -1), bottom.y)
  context.closePath()
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

function visibleBeatMarkers(
  chart: ParsedChart,
  fromSeconds: number,
  toSeconds: number,
): BeatMarker[] {
  const markers: BeatMarker[] = []
  const seen = new Set<number>()

  chart.tempos.forEach((tempo, index) => {
    const segmentStart = chart.metadata.offsetSeconds + tempo.timeSeconds
    const segmentEnd =
      index + 1 < chart.tempos.length
        ? chart.metadata.offsetSeconds + chart.tempos[index + 1].timeSeconds
        : Number.POSITIVE_INFINITY
    const visibleStart = Math.max(fromSeconds, segmentStart)
    const visibleEnd = Math.min(toSeconds, segmentEnd)
    if (visibleStart > visibleEnd) return

    const secondsPerBeat = 60 / tempo.bpm
    const firstStep = Math.max(
      0,
      Math.ceil((visibleStart - segmentStart) / secondsPerBeat - 0.0001),
    )

    for (let step = firstStep; ; step += 1) {
      const timeSeconds = segmentStart + step * secondsPerBeat
      if (timeSeconds > visibleEnd + 0.0001) break
      const key = Math.round(timeSeconds * 1000)
      if (seen.has(key)) continue
      seen.add(key)

      const absoluteBeat = tempo.tick / chart.metadata.resolution + step
      markers.push({
        timeSeconds,
        downbeat: Math.round(absoluteBeat) % 4 === 0,
      })
    }
  })

  return markers.sort((a, b) => a.timeSeconds - b.timeSeconds)
}

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.floor(bounds.width * ratio))
  const height = Math.max(1, Math.floor(bounds.height * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return context
}

function drawHighwaySurface(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPowerActive: boolean,
  songTimeSeconds: number,
): void {
  const top = highwayPoint(width, height, 0)
  const bottom = highwayPoint(width, height, SURFACE_END_PROGRESS)

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

  for (let band = 0; band < 14; band += 1) {
    const startProgress = (band / 14) * SURFACE_END_PROGRESS
    const endProgress = ((band + 1) / 14) * SURFACE_END_PROGRESS
    const start = highwayPoint(width, height, startProgress)
    const end = highwayPoint(width, height, endProgress)
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

  if (starPowerActive) {
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
  }
  context.restore()

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

function drawTimingWindows(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  travelSeconds: number,
): void {
  const hitWindowSeconds = HIT_WINDOW_MS / 1000
  const early = highwayPoint(
    width,
    height,
    1 - hitWindowSeconds / travelSeconds,
  )
  const late = highwayPoint(
    width,
    height,
    1 + hitWindowSeconds / travelSeconds,
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
    const point = highwayPoint(width, height, progress)
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

function noteRenderState(
  note: ChartNote,
  noteIndex: number,
  frame: GameFrame,
  travelSeconds: number,
): NoteRenderState | null {
  const state = frame.noteStates[noteIndex]
  const sustainState = frame.sustainStates[noteIndex]
  const sustainEnd = note.timeSeconds + note.sustainSeconds
  const activeSustain =
    state === 'hit' &&
    note.sustainSeconds > 0.03 &&
    sustainState !== 'none' &&
    sustainEnd > frame.visualTimeSeconds
  if (state === 'hit' && !activeSustain) return null

  const secondsUntil = note.timeSeconds - frame.visualTimeSeconds
  if (!activeSustain && (secondsUntil > travelSeconds || secondsUntil < -0.2)) {
    return null
  }

  const progress = activeSustain ? 1 : 1 - secondsUntil / travelSeconds
  if (progress < 0 || progress > 1.16) return null

  const visibleProgress = Math.max(0, Math.min(1, progress))
  const missedFade = 1 - Math.min(1, Math.max(0, progress - 1) / 0.055)
  const sustainHeld = activeSustain && sustainState !== 'released'
  const projectedProgress = projectHighwayProgress(visibleProgress)
  const depthAlpha =
    state === 'miss'
      ? 0.34 * missedFade
      : activeSustain
        ? sustainHeld
          ? 1
          : 0.45
        : 0.38 + projectedProgress * 0.62

  return {
    state,
    sustainState,
    activeSustain,
    progress,
    depthAlpha,
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
): void {
  if (note.sustainSeconds <= 0.03) return

  const sustainEnd = note.timeSeconds + note.sustainSeconds
  const tailProgress =
    1 - (sustainEnd - visualTimeSeconds) / travelSeconds
  const head = highwayPoint(width, height, render.progress)
  const tail = highwayPoint(width, height, Math.max(-0.05, tailProgress))
  const headSize = noteRadius(head)
  const lanes: Array<Lane | null> = note.open ? [null] : note.lanes
  const held = render.activeSustain && render.sustainState !== 'released'

  context.save()
  context.globalAlpha = render.depthAlpha
  for (const lane of lanes) {
    const color = starPowerActive
      ? STAR_POWER_COLOR
      : note.starPower
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
    context.shadowColor = held || note.starPower ? color : 'transparent'
    context.shadowBlur = held ? (note.starPower ? 22 : 14) : note.starPower ? 9 : 0
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
      context.shadowColor = note.starPower ? '#65dcff' : color
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
): void {
  if (note.lanes.length < 2) return
  const positions = note.lanes.map((lane) =>
    highwayLaneX(width, lane, render.progress),
  )
  const point = highwayPoint(width, height, render.progress)
  const size = noteRadius(point)
  context.save()
  context.globalAlpha = render.depthAlpha
  context.beginPath()
  context.moveTo(Math.min(...positions), point.y + size * 0.2)
  context.lineTo(Math.max(...positions), point.y + size * 0.2)
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

function drawGem(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  lane: Lane,
  note: ChartNote,
  missed: boolean,
  starPowerActive: boolean,
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

  if (note.starPower && !missed) {
    traceStar(context, x, y - radius * 0.04, radius, radius * 0.7)
  } else {
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
  }
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

  if (note.starPower && !missed) {
    traceStar(
      context,
      x,
      y - radius * 0.11,
      radius * 0.7,
      radius * 0.43,
    )
  } else {
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
  }
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

  if (note.starPower && !missed) {
    traceStar(
      context,
      x,
      y - radius * 0.04,
      radius * 1.08,
      radius * 0.76,
    )
    context.strokeStyle = 'rgba(224, 250, 255, 0.98)'
    context.lineJoin = 'round'
    context.lineWidth = Math.max(1.5, radius * 0.1)
    context.shadowColor = '#70dfff'
    context.shadowBlur = radius * 1.2
    context.stroke()

    context.beginPath()
    context.ellipse(
      x - radius * 0.2,
      y - radius * 0.31,
      radius * 0.2,
      radius * 0.075,
      -0.18,
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(255, 255, 255, 0.84)'
    context.shadowBlur = 0
    context.fill()
  }
  context.restore()
}

function drawOpenGem(
  context: CanvasRenderingContext2D,
  point: HighwayPoint,
  size: number,
  note: ChartNote,
  missed: boolean,
  starPowerActive: boolean,
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

  if (note.starPower && !missed) {
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
  chart.notes.forEach((note, index) => {
    if (
      frame.noteStates[index] === 'hit' &&
      frame.sustainStates[index] === 'holding' &&
      note.timeSeconds + note.sustainSeconds > frame.visualTimeSeconds
    ) {
      note.lanes.forEach((lane) => lanes.add(lane))
    }
  })
  return lanes
}

function drawStrikeLineAndReceptors(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
  sustainingLanes: Set<Lane>,
): void {
  const bottom = highwayPoint(width, height, 1)

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

function drawHitEffects(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: GameFrame,
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
  const bottom = highwayPoint(width, height, 1)
  const opacity = Math.pow(1 - impactProgress, 1.15)
  const radius = receptorRadius(bottom)

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

export function drawHighway(
  canvas: HTMLCanvasElement,
  chart: ParsedChart,
  frame: GameFrame,
  noteSpeed = 12,
): void {
  const context = resizeCanvas(canvas)
  if (!context) return

  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const travelSeconds = travelSecondsForNoteSpeed(noteSpeed)

  context.clearRect(0, 0, width, height)
  drawHighwaySurface(
    context,
    width,
    height,
    frame.stats.starPowerActive,
    frame.songTimeSeconds,
  )
  drawTimingWindows(context, width, height, travelSeconds)
  drawBeatLines(
    context,
    width,
    height,
    chart,
    frame.visualTimeSeconds,
    travelSeconds,
  )

  for (let noteIndex = 0; noteIndex < chart.notes.length; noteIndex += 1) {
    const note = chart.notes[noteIndex]
    const render = noteRenderState(note, noteIndex, frame, travelSeconds)
    if (!render) continue
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
    )
  }

  drawStrikeLineAndReceptors(
    context,
    width,
    height,
    frame,
    activeSustainLanes(chart, frame),
  )

  for (let noteIndex = 0; noteIndex < chart.notes.length; noteIndex += 1) {
    const note = chart.notes[noteIndex]
    const render = noteRenderState(note, noteIndex, frame, travelSeconds)
    if (!render) continue
    if (render.activeSustain) continue
    const point = highwayPoint(width, height, render.progress)
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
      )
    } else {
      drawChordBridge(
        context,
        width,
        height,
        note,
        render,
        frame.stats.starPowerActive,
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
        )
      }
    }
    context.restore()
  }
  drawHitEffects(context, width, height, frame)
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
