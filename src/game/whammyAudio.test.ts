import { describe, expect, it } from 'vitest'
import { whammyAudioParameters } from './whammyAudio'

describe('whammy audio parameters', () => {
  it('returns to a zero-delay neutral state', () => {
    expect(whammyAudioParameters(0)).toEqual({
      baseDelaySeconds: 0,
      modulationDepthSeconds: 0,
      modulationFrequencyHz: 5,
    })
  })

  it('creates a bounded vibrato without changing source playback speed', () => {
    expect(whammyAudioParameters(1)).toEqual({
      baseDelaySeconds: 0.006,
      modulationDepthSeconds: 0.0045,
      modulationFrequencyHz: 7,
    })
  })

  it('clamps invalid controller travel outside the supported range', () => {
    expect(whammyAudioParameters(-1)).toEqual(whammyAudioParameters(0))
    expect(whammyAudioParameters(2)).toEqual(whammyAudioParameters(1))
  })
})
