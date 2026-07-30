import { describe, expect, it } from 'vitest'
import {
  bindingLabel,
  cloneReports,
  mappingPrompt,
  sameBinding,
  WHAMMY_STEP,
} from './mappingFlow'

describe('controller mapping flow', () => {
  it('compares directional axes without conflating opposite directions', () => {
    expect(
      sameBinding(
        { type: 'axis', index: 1, direction: -1 },
        { type: 'axis', index: 1, direction: -1 },
      ),
    ).toBe(true)
    expect(
      sameBinding(
        { type: 'axis', index: 1, direction: -1 },
        { type: 'axis', index: 1, direction: 1 },
      ),
    ).toBe(false)
  })

  it('keeps captured HID reports isolated from future mutations', () => {
    const bytes = new Uint8Array([1, 2])
    const copy = cloneReports(new Map([[0, bytes]]))
    bytes[0] = 9
    expect(copy.get(0)).toEqual(new Uint8Array([1, 2]))
  })

  it('describes direct bindings and whammy prompts clearly', () => {
    expect(
      bindingLabel({
        type: 'hid',
        reportId: 2,
        byteIndex: 4,
        mask: 1,
        activeValue: 1,
      }),
    ).toBe('direct input 2:4')
    expect(mappingPrompt(WHAMMY_STEP, true)).toContain(
      'fully and briefly hold',
    )
  })
})
