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
  size: number
}

export function travelSecondsForNoteSpeed(noteSpeed: number): number {
  const normalizedSpeed = Math.max(6, Math.min(18, noteSpeed))
  return 3 - normalizedSpeed * 0.09
}

function highwayPoint(
  width: number,
  height: number,
  progress: number,
): HighwayPoint {
  const topY = height * 0.045
  const hitY = height * 0.86
  const bounded = Math.max(-0.08, Math.min(1.16, progress))
  const eased =
    bounded <= 1
      ? Math.sign(bounded) * Math.pow(Math.abs(bounded), 1.08)
      : 1 + (bounded - 1) * 1.48
  const center = width / 2
  const trackWidth = width * (0.23 + Math.min(1.14, Math.max(0, eased)) * 0.66)

  return {
    y: topY + eased * (hitY - topY),
    center,
    trackWidth,
    hitY,
    topY,
  }
}

function laneX(
  width: number,
  height: number,
  lane: Lane,
  progress: number,
): number {
  const point = highwayPoint(width, height, progress)
  const laneWidth = point.trackWidth / 5
  return point.center - point.trackWidth / 2 + laneWidth * (lane + 0.5)
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
  context.moveTo(trackEdge(top, -1), top.topY)
  context.lineTo(trackEdge(top, 1), top.topY)
  context.lineTo(trackEdge(bottom, 1), bottom.hitY)
  context.lineTo(trackEdge(bottom, -1), bottom.hitY)
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
): void {
  const top = highwayPoint(width, height, 0)
  const bottom = highwayPoint(width, height, 1)

  const background = context.createRadialGradient(
    width / 2,
    height * 0.45,
    width * 0.05,
    width / 2,
    height * 0.5,
    width * 0.78,
  )
  background.addColorStop(0, '#121726')
  background.addColorStop(0.62, '#060811')
  background.addColorStop(1, '#020307')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  context.save()
  trackPath(context, top, bottom)
  context.clip()

  const surface = context.createLinearGradient(0, top.topY, 0, bottom.hitY)
  surface.addColorStop(0, '#11151c')
  surface.addColorStop(0.46, '#17191d')
  surface.addColorStop(1, '#090a0c')
  context.fillStyle = surface
  context.fillRect(
    trackEdge(bottom, -1),
    top.topY,
    bottom.trackWidth,
    bottom.hitY - top.topY,
  )

  for (let band = 0; band < 13; band += 1) {
    const startProgress = band / 13
    const endProgress = (band + 1) / 13
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
    context.fillRect(x, top.topY, 1, bottom.hitY - top.topY)
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

  for (let boundary = 1; boundary < 5; boundary += 1) {
    context.beginPath()
    context.moveTo(
      trackEdge(top, -1) + (top.trackWidth / 5) * boundary,
      top.topY,
    )
    context.lineTo(
      trackEdge(bottom, -1) + (bottom.trackWidth / 5) * boundary,
      bottom.hitY,
    )
    context.strokeStyle = 'rgba(201, 207, 218, 0.16)'
    context.lineWidth = 1
    context.shadowColor = 'rgba(255,255,255,0.18)'
    context.shadowBlur = 3
    context.stroke()
  }
  context.shadowBlur = 0

  for (const side of [-1, 1] as const) {
    context.beginPath()
    context.moveTo(trackEdge(top, side), top.topY)
    context.lineTo(trackEdge(bottom, side), bottom.hitY)
    context.strokeStyle = 'rgba(4, 5, 8, 0.96)'
    context.lineWidth = 12
    context.stroke()

    context.beginPath()
    context.moveTo(trackEdge(top, side), top.topY)
    context.lineTo(trackEdge(bottom, side), bottom.hitY)
    const rail = context.createLinearGradient(
      trackEdge(top, side),
      top.topY,
      trackEdge(bottom, side),
      bottom.hitY,
    )
    rail.addColorStop(0, '#77818c')
    rail.addColorStop(0.45, '#29313a')
    rail.addColorStop(0.72, '#aeb6bd')
    rail.addColorStop(1, '#3b444d')
    context.strokeStyle = rail
    context.lineWidth = 6
    context.shadowColor = 'rgba(124, 153, 190, 0.32)'
    context.shadowBlur = 8
    context.stroke()

    context.beginPath()
    context.moveTo(trackEdge(top, side) - side * 1.4, top.topY)
    context.lineTo(trackEdge(bottom, side) - side * 1.4, bottom.hitY)
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

function drawNextNoteRail(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: ParsedChart,
  frame: GameFrame,
  travelSeconds: number,
): void {
  const nextNoteIndex = frame.noteStates.findIndex(
    (state, index) =>
      state === 'pending' &&
      chart.notes[index].timeSeconds >= frame.visualTimeSeconds - 0.16,
  )
  if (nextNoteIndex < 0) return

  const note = chart.notes[nextNoteIndex]
  const progress =
    1 - (note.timeSeconds - frame.visualTimeSeconds) / travelSeconds
  if (progress < 0 || progress > 0.98) return
  const point = highwayPoint(width, height, progress)
  const alpha = progress < 0.76 ? 0.58 : Math.max(0, (0.98 - progress) * 2.6)

  context.save()
  context.beginPath()
  context.moveTo(trackEdge(point, -1), point.y)
  context.lineTo(trackEdge(point, 1), point.y)
  context.strokeStyle = `rgba(216, 221, 255, ${alpha})`
  context.lineWidth = Math.max(1, 1 + progress)
  context.setLineDash([5, 7])
  context.shadowColor = 'rgba(146, 157, 255, 0.72)'
  context.shadowBlur = 8
  context.stroke()
  context.restore()
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
  const depthAlpha =
    state === 'miss'
      ? 0.34 * missedFade
      : activeSustain
        ? sustainHeld
          ? 1
          : 0.45
        : 0.42 + visibleProgress * 0.58

  return {
    state,
    sustainState,
    activeSustain,
    progress,
    depthAlpha,
    size: 7 + visibleProgress * 18,
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
): void {
  if (note.sustainSeconds <= 0.03) return

  const sustainEnd = note.timeSeconds + note.sustainSeconds
  const tailProgress =
    1 - (sustainEnd - visualTimeSeconds) / travelSeconds
  const head = highwayPoint(width, height, render.progress)
  const tail = highwayPoint(width, height, Math.max(-0.05, tailProgress))
  const lanes: Array<Lane | null> = note.open ? [null] : note.lanes
  const held = render.activeSustain && render.sustainState !== 'released'

  context.save()
  context.globalAlpha = render.depthAlpha
  for (const lane of lanes) {
    const color = lane === null ? '#e7e9ff' : LANE_COLORS[lane]
    const headX =
      lane === null ? head.center : laneX(width, height, lane, render.progress)
    const tailX =
      lane === null ? tail.center : laneX(width, height, lane, tailProgress)
    const thickness =
      lane === null
        ? Math.max(9, head.trackWidth * 0.045)
        : Math.max(5, render.size * 0.42)

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
    context.shadowColor = held ? color : 'transparent'
    context.shadowBlur = held ? 14 : 0
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
  }
  context.restore()
}

function drawChordBridge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  note: ChartNote,
  render: NoteRenderState,
): void {
  if (note.lanes.length < 2) return
  const positions = note.lanes.map((lane) =>
    laneX(width, height, lane, render.progress),
  )
  const point = highwayPoint(width, height, render.progress)
  context.save()
  context.globalAlpha = render.depthAlpha
  context.beginPath()
  context.moveTo(Math.min(...positions), point.y + render.size * 0.2)
  context.lineTo(Math.max(...positions), point.y + render.size * 0.2)
  context.strokeStyle =
    render.state === 'miss'
      ? 'rgba(92, 96, 105, 0.72)'
      : 'rgba(220, 225, 233, 0.72)'
  context.lineWidth = Math.max(3, render.size * 0.25)
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
): void {
  const color = missed ? '#62666c' : LANE_COLORS[lane]
  const darkColor = missed ? '#34373b' : `${LANE_COLORS[lane]}a8`

  context.save()
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

  const capScale = note.tap ? 0.56 : note.hopo ? 0.34 : 0.5
  context.beginPath()
  context.ellipse(
    x,
    y - radius * 0.3,
    radius * capScale,
    radius * (note.tap ? 0.21 : note.hopo ? 0.12 : 0.17),
    0,
    0,
    Math.PI * 2,
  )
  context.fillStyle = ellipseGradient(
    context,
    x,
    y - radius * 0.32,
    radius * capScale,
    missed ? '#9da0a4' : '#ffffff',
    missed ? '#5e6267' : '#aab0b6',
  )
  context.strokeStyle =
    note.tap && !missed
      ? 'rgba(222, 235, 255, 0.96)'
      : 'rgba(255, 255, 255, 0.45)'
  context.lineWidth = note.tap ? Math.max(1.5, radius * 0.1) : 1
  context.shadowColor =
    note.tap && !missed ? 'rgba(192, 220, 255, 0.92)' : 'transparent'
  context.shadowBlur = note.tap ? radius : 0
  context.fill()
  context.stroke()

  if (note.forced && !missed) {
    context.beginPath()
    context.ellipse(
      x,
      y,
      radius * 0.84,
      radius * 0.43,
      0,
      0,
      Math.PI * 2,
    )
    context.strokeStyle = 'rgba(255, 255, 255, 0.78)'
    context.lineWidth = Math.max(1, radius * 0.08)
    context.setLineDash([radius * 0.24, radius * 0.18])
    context.stroke()
    context.setLineDash([])
  }
  context.restore()
}

function drawOpenGem(
  context: CanvasRenderingContext2D,
  point: HighwayPoint,
  size: number,
  missed: boolean,
): void {
  const barWidth = point.trackWidth * 0.68
  const barHeight = Math.max(7, size * 0.7)
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
    : ellipseGradient(
        context,
        point.center,
        point.y,
        barWidth * 0.45,
        '#ffffff',
        '#99a0b7',
      )
  context.shadowColor = missed ? 'transparent' : 'rgba(218, 224, 255, 0.72)'
  context.shadowBlur = size
  context.fill()
  context.shadowBlur = 0
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
  context.strokeStyle = 'rgba(228, 232, 237, 0.75)'
  context.lineWidth = 4
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
    const x = laneX(width, height, lane, 1)
    const radius = Math.min(30, width * 0.044)
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
  const opacity = 1 - impactProgress

  context.save()
  context.globalAlpha = opacity
  context.globalCompositeOperation = 'lighter'

  if (frame.hitFlash.open) {
    const barWidth = bottom.trackWidth * (0.68 + impactProgress * 0.08)
    const barHeight = Math.min(24, width * 0.038)
    context.beginPath()
    context.roundRect(
      bottom.center - barWidth / 2,
      bottom.hitY - barHeight / 2,
      barWidth,
      barHeight,
      barHeight,
    )
    context.strokeStyle = 'rgba(230, 235, 255, 0.9)'
    context.lineWidth = 3
    context.shadowColor = '#d9e0ff'
    context.shadowBlur = 26
    context.stroke()
  } else {
    for (const lane of frame.hitFlash.lanes) {
      const x = laneX(width, height, lane, 1)
      const radius = Math.min(30, width * 0.044)
      const color = LANE_COLORS[lane]
      const bloomRadius = radius * (1.05 + impactProgress * 1.35)

      const bloom = context.createRadialGradient(
        x,
        bottom.hitY,
        0,
        x,
        bottom.hitY,
        bloomRadius,
      )
      bloom.addColorStop(0, 'rgba(255,255,255,0.94)')
      bloom.addColorStop(0.24, color)
      bloom.addColorStop(1, `${color}00`)
      context.beginPath()
      context.ellipse(
        x,
        bottom.hitY,
        bloomRadius,
        bloomRadius * 0.72,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = bloom
      context.fill()

      for (let spark = 0; spark < 6; spark += 1) {
        const angle = -Math.PI * 0.92 + (spark / 5) * Math.PI * 0.84
        const distance = radius * (0.55 + impactProgress * (1.5 + spark * 0.1))
        const startX = x + Math.cos(angle) * radius * 0.42
        const startY = bottom.hitY + Math.sin(angle) * radius * 0.32
        context.beginPath()
        context.moveTo(startX, startY)
        context.lineTo(
          x + Math.cos(angle) * distance,
          bottom.hitY + Math.sin(angle) * distance,
        )
        context.strokeStyle = spark % 2 === 0 ? '#ffffff' : color
        context.lineWidth = Math.max(1, radius * 0.08)
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
  drawHighwaySurface(context, width, height)
  drawTimingWindows(context, width, height, travelSeconds)
  drawBeatLines(
    context,
    width,
    height,
    chart,
    frame.visualTimeSeconds,
    travelSeconds,
  )
  drawNextNoteRail(context, width, height, chart, frame, travelSeconds)

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
    )
  }

  for (let noteIndex = 0; noteIndex < chart.notes.length; noteIndex += 1) {
    const note = chart.notes[noteIndex]
    const render = noteRenderState(note, noteIndex, frame, travelSeconds)
    if (!render) continue
    if (render.activeSustain) continue
    const point = highwayPoint(width, height, render.progress)
    context.save()
    context.globalAlpha = render.depthAlpha

    if (note.open) {
      drawOpenGem(context, point, render.size, render.state === 'miss')
    } else {
      drawChordBridge(context, width, height, note, render)
      for (const lane of note.lanes) {
        drawGem(
          context,
          laneX(width, height, lane, render.progress),
          point.y,
          render.size,
          lane,
          note,
          render.state === 'miss',
        )
      }
    }
    context.restore()
  }

  drawStrikeLineAndReceptors(
    context,
    width,
    height,
    frame,
    activeSustainLanes(chart, frame),
  )
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
