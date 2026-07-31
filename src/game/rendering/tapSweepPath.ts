import type {
  ChartNote,
  GameFrame,
  ParsedChart,
} from '../../types/game'
import {
  highwayLaneX,
  highwayPoint,
  noteRadius,
} from './highwayGeometry'
import type { NoteRenderState } from './noteVisibility'

interface TapSweepRender {
  noteIndex: number
  note: ChartNote
  render: NoteRenderState
}

export function isTapSweepTransition(
  source: ChartNote,
  destination: ChartNote,
  sourceState: GameFrame['noteStates'][number],
  destinationState: GameFrame['noteStates'][number],
): boolean {
  if (sourceState === 'miss' || destinationState !== 'pending') return false
  if (source.open || destination.open) return false
  if (source.lanes.length !== 1 || destination.lanes.length !== 1) {
    return false
  }
  if (source.lanes[0] === destination.lanes[0]) return false
  if (source.sustainSeconds > 0.03) return false
  return destination.hopo || destination.tap
}

export function drawTapSweepPaths(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: ParsedChart,
  frame: GameFrame,
  noteRenders: TapSweepRender[],
  travelSeconds: number,
  highwayLength: number,
  hitLineRatio: number,
  laneColors: readonly string[],
  starPowerColor: string,
): void {
  for (const { noteIndex, note, render } of noteRenders) {
    if (noteIndex === 0) continue
    const sourceIndex = noteIndex - 1
    const source = chart.notes[sourceIndex]
    if (
      !isTapSweepTransition(
        source,
        note,
        frame.noteStates[sourceIndex],
        frame.noteStates[noteIndex],
      )
    ) {
      continue
    }

    const rawSourceProgress =
      1 - (source.timeSeconds - frame.visualTimeSeconds) / travelSeconds
    if (rawSourceProgress > 1.16 || render.progress < 0) continue
    const sourceProgress =
      frame.noteStates[sourceIndex] === 'hit'
        ? 1
        : Math.max(0, rawSourceProgress)
    const sourcePoint = highwayPoint(
      width,
      height,
      sourceProgress,
      highwayLength,
      hitLineRatio,
    )
    const destinationPoint = highwayPoint(
      width,
      height,
      render.progress,
      highwayLength,
      hitLineRatio,
    )
    const sourceLane = source.lanes[0]
    const destinationLane = note.lanes[0]
    const sourceX = highwayLaneX(width, sourceLane, sourceProgress)
    const destinationX = highwayLaneX(
      width,
      destinationLane,
      render.progress,
    )
    const sourceColor = frame.stats.starPowerActive
      ? starPowerColor
      : laneColors[sourceLane]
    const destinationColor = frame.stats.starPowerActive
      ? '#9cecff'
      : laneColors[destinationLane]
    const size = noteRadius(destinationPoint)
    const ribbonWidth = Math.max(3, size * 0.2)
    const angle = Math.atan2(
      destinationPoint.y - sourcePoint.y,
      destinationX - sourceX,
    )
    const distance = Math.hypot(
      destinationX - sourceX,
      destinationPoint.y - sourcePoint.y,
    )

    context.save()
    context.globalAlpha = render.depthAlpha * 0.82
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(sourceX, sourcePoint.y)
    context.lineTo(destinationX, destinationPoint.y)
    context.strokeStyle = 'rgba(2, 4, 8, 0.9)'
    context.lineWidth = ribbonWidth + Math.max(4, size * 0.2)
    context.stroke()

    const ribbon = context.createLinearGradient(
      sourceX,
      sourcePoint.y,
      destinationX,
      destinationPoint.y,
    )
    ribbon.addColorStop(0, `${sourceColor}8f`)
    ribbon.addColorStop(0.5, 'rgba(221, 244, 255, 0.82)')
    ribbon.addColorStop(1, `${destinationColor}dc`)
    context.beginPath()
    context.moveTo(sourceX, sourcePoint.y)
    context.lineTo(destinationX, destinationPoint.y)
    context.strokeStyle = ribbon
    context.lineWidth = ribbonWidth
    context.shadowColor = note.tap
      ? 'rgba(96, 215, 255, 0.72)'
      : 'rgba(238, 247, 255, 0.58)'
    context.shadowBlur = Math.min(12, size * 0.55)
    context.stroke()
    context.shadowBlur = 0

    const markerCount = Math.max(1, Math.min(3, Math.floor(distance / 62)))
    context.strokeStyle = 'rgba(248, 253, 255, 0.88)'
    context.lineWidth = Math.max(1.2, ribbonWidth * 0.42)
    for (let marker = 1; marker <= markerCount; marker += 1) {
      const progress = marker / (markerCount + 1)
      const x = sourceX + (destinationX - sourceX) * progress
      const y = sourcePoint.y + (destinationPoint.y - sourcePoint.y) * progress
      const markerSize = Math.max(3.5, size * 0.2)
      context.save()
      context.translate(x, y)
      context.rotate(angle)
      context.beginPath()
      context.moveTo(-markerSize, -markerSize * 0.7)
      context.lineTo(0, 0)
      context.lineTo(-markerSize, markerSize * 0.7)
      context.stroke()
      context.restore()
    }
    context.restore()
  }
}
