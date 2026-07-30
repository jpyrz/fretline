import type { ParsedChart } from '../../types/game'

export interface BeatMarker {
  timeSeconds: number
  downbeat: boolean
}

export function visibleBeatMarkers(
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
