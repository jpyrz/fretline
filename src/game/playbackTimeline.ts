export const COUNTDOWN_SECONDS = 3
export const RESUME_LEAD_SECONDS = 0.08

export interface PlaybackSchedule {
  chartStartContextTime: number
  sourceStartContextTime: number
  sourceOffsetSeconds: number
}

export interface CountdownCue {
  label: string
  progress: number
}

export function chartTimeForPlayback(
  elapsedContextTime: number,
  playbackRate: number,
): number {
  return elapsedContextTime < 0
    ? elapsedContextTime
    : elapsedContextTime * Math.max(0.01, playbackRate)
}

export function createPlaybackSchedule(
  currentContextTime: number,
  songTimeSeconds: number,
  leadSeconds = 0,
  audioOffsetSeconds = 0,
  playbackRate = 1,
): PlaybackSchedule {
  const safePlaybackRate = Math.max(0.01, playbackRate)
  const requestedStartContextTime = currentContextTime + leadSeconds
  const chartStartContextTime =
    songTimeSeconds < 0
      ? requestedStartContextTime - songTimeSeconds
      : requestedStartContextTime - songTimeSeconds / safePlaybackRate
  const audioPositionAtRequestedStart =
    songTimeSeconds + audioOffsetSeconds
  const sourceStartContextTime =
    audioPositionAtRequestedStart < 0
      ? chartStartContextTime - audioOffsetSeconds / safePlaybackRate
      : requestedStartContextTime

  return {
    chartStartContextTime,
    sourceStartContextTime,
    sourceOffsetSeconds: Math.max(0, audioPositionAtRequestedStart),
  }
}

export function countdownCue(songTimeSeconds: number): CountdownCue | null {
  if (
    songTimeSeconds < -COUNTDOWN_SECONDS ||
    songTimeSeconds >= 0.45
  ) {
    return null
  }

  if (songTimeSeconds >= 0) {
    return {
      label: 'GO!',
      progress: Math.min(1, songTimeSeconds / 0.45),
    }
  }

  const count = Math.min(
    COUNTDOWN_SECONDS,
    Math.max(1, Math.ceil(-songTimeSeconds)),
  )

  return {
    label: String(count),
    progress: Math.min(1, Math.max(0, songTimeSeconds + count)),
  }
}
