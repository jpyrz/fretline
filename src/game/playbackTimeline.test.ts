import { describe, expect, it } from 'vitest'
import {
  countdownCue,
  createPlaybackSchedule,
} from './playbackTimeline'

describe('playback timeline', () => {
  it('schedules a fresh song after its countdown', () => {
    expect(createPlaybackSchedule(10, -3)).toEqual({
      audioStartContextTime: 13,
      sourceStartContextTime: 13,
      sourceOffsetSeconds: 0,
    })
  })

  it('resumes audio from a saved song position after a short lead', () => {
    expect(createPlaybackSchedule(10, 42.5, 0.08)).toEqual({
      audioStartContextTime: -32.42,
      sourceStartContextTime: 10.08,
      sourceOffsetSeconds: 42.5,
    })
  })

  it('derives countdown cues from song time', () => {
    expect(countdownCue(-3)?.label).toBe('3')
    expect(countdownCue(-1.6)?.label).toBe('2')
    expect(countdownCue(-0.2)?.label).toBe('1')
    expect(countdownCue(0.1)?.label).toBe('GO!')
    expect(countdownCue(0.5)).toBeNull()
  })
})
