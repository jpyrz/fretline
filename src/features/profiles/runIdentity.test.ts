import { describe, expect, it } from 'vitest'
import { HANDITAP_VERSION } from '../../game/handiTap/handiTap'
import { profileChartKey } from './runIdentity'

describe('profile chart identity', () => {
  it('separates standard and HandiTap records', () => {
    const standard = profileChartKey({
      songId: 'song-1',
      trackName: 'ExpertSingle',
      inputMode: 'standard',
    })
    const tap = profileChartKey({
      songId: 'song-1',
      trackName: 'ExpertSingle',
      inputMode: 'tap',
    })

    expect(standard).not.toBe(tap)
    expect(tap).toContain(`handitap-${HANDITAP_VERSION}`)
  })
})
