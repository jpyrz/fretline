import { describe, expect, it } from 'vitest'
import {
  chartTimeForPlayback,
  countdownCue,
  createPlaybackSchedule,
} from './playbackTimeline'

describe('playback timeline', () => {
  it('schedules a fresh song after its countdown', () => {
    expect(createPlaybackSchedule(10, -3)).toEqual({
      chartStartContextTime: 13,
      sourceStartContextTime: 13,
      sourceOffsetSeconds: 0,
    })
  })

  it('resumes audio from a saved song position after a short lead', () => {
    expect(createPlaybackSchedule(10, 42.5, 0.08)).toEqual({
      chartStartContextTime: -32.42,
      sourceStartContextTime: 10.08,
      sourceOffsetSeconds: 42.5,
    })
  })

  it('advances audio without moving the authoritative chart timeline', () => {
    expect(createPlaybackSchedule(10, -3, 0, 0.04)).toEqual({
      chartStartContextTime: 13,
      sourceStartContextTime: 12.96,
      sourceOffsetSeconds: 0,
    })
  })

  it('delays audio without moving the authoritative chart timeline', () => {
    expect(createPlaybackSchedule(10, -3, 0, -0.04)).toEqual({
      chartStartContextTime: 13,
      sourceStartContextTime: 13.04,
      sourceOffsetSeconds: 0,
    })
  })

  it('derives countdown cues from song time', () => {
    expect(countdownCue(-3)?.label).toBe('3')
    expect(countdownCue(-1.6)?.label).toBe('2')
    expect(countdownCue(-0.2)?.label).toBe('1')
    expect(countdownCue(0.1)?.label).toBe('GO!')
    expect(countdownCue(0.5)).toBeNull()
  })

  it('schedules resumed chart time against a slower playback clock', () => {
    expect(createPlaybackSchedule(10, 42.5, 0.08, 0, 0.5)).toEqual({
      chartStartContextTime: -74.92,
      sourceStartContextTime: 10.08,
      sourceOffsetSeconds: 42.5,
    })
  })

  it('scales pre-roll audio correction for practice speed', () => {
    expect(createPlaybackSchedule(10, -3, 0, 0.04, 0.5)).toEqual({
      chartStartContextTime: 13,
      sourceStartContextTime: 12.92,
      sourceOffsetSeconds: 0,
    })
  })

  it('keeps countdown real-time and slows positive chart time', () => {
    expect(chartTimeForPlayback(-2, 0.5)).toBe(-2)
    expect(chartTimeForPlayback(2, 0.5)).toBe(1)
  })
})
