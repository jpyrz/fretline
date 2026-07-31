import type { Lane } from '../../types/game'

const MAX_HIGHWAY_WIDTH = 760
const PERSPECTIVE_POWER = 1.68
export const DEFAULT_HIGHWAY_LENGTH = 55
export const DEFAULT_HIT_LINE_RATIO = 0.89
export const TAP_HIT_LINE_RATIO = 0.76
export const SURFACE_END_PROGRESS = 1.18

export interface HighwayPoint {
  y: number
  center: number
  trackWidth: number
  hitY: number
  topY: number
}

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

export function highwayTopY(
  width: number,
  height: number,
  highwayLength = DEFAULT_HIGHWAY_LENGTH,
  hitLineRatio = DEFAULT_HIT_LINE_RATIO,
): number {
  const boundedLength = Math.max(45, Math.min(100, highwayLength))
  const aspectRatio = width / Math.max(1, height)
  const portraitDepth =
    Math.max(0, Math.min(1, (1.05 - aspectRatio) / 0.45)) * 25
  const responsiveLength = Math.min(100, boundedLength + portraitDepth)
  const hitY = height * hitLineRatio

  return hitY - height * 0.85 * (responsiveLength / 100)
}

export function highwayPoint(
  width: number,
  height: number,
  progress: number,
  highwayLength = DEFAULT_HIGHWAY_LENGTH,
  hitLineRatio = DEFAULT_HIT_LINE_RATIO,
): HighwayPoint {
  const topY = highwayTopY(
    width,
    height,
    highwayLength,
    hitLineRatio,
  )
  const hitY = height * hitLineRatio
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

export function highwayGuideWidthAtY(
  width: number,
  height: number,
  y: number,
  highwayLength = DEFAULT_HIGHWAY_LENGTH,
  hitLineRatio = DEFAULT_HIT_LINE_RATIO,
): number {
  const top = highwayPoint(
    width,
    height,
    0,
    highwayLength,
    hitLineRatio,
  )
  const bottom = highwayPoint(
    width,
    height,
    SURFACE_END_PROGRESS,
    highwayLength,
    hitLineRatio,
  )
  const depth = Math.max(
    0,
    Math.min(1, (y - top.y) / Math.max(1, bottom.y - top.y)),
  )

  return top.trackWidth + (bottom.trackWidth - top.trackWidth) * depth
}

export function noteRadius(point: HighwayPoint): number {
  return Math.max(6, Math.min(42, (point.trackWidth / 5) * 0.26))
}

export function receptorRadius(point: HighwayPoint): number {
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

export function trackEdge(point: HighwayPoint, side: -1 | 1): number {
  return point.center + (point.trackWidth / 2) * side
}

export function trackPath(
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
