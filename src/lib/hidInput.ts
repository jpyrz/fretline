import type { HidBinding } from '../types/game'

export type HidReports = ReadonlyMap<number, Uint8Array>

function bitCount(value: number): number {
  let remaining = value
  let count = 0
  while (remaining) {
    count += remaining & 1
    remaining >>>= 1
  }
  return count
}

export function activeHidBindings(
  reports: HidReports,
  baseline: HidReports,
): HidBinding[] {
  const bindings: HidBinding[] = []

  reports.forEach((bytes, reportId) => {
    const restingBytes = baseline.get(reportId)
    if (!restingBytes) return

    bytes.forEach((value, byteIndex) => {
      const restingValue = restingBytes[byteIndex]
      if (restingValue === undefined) return
      const mask = value ^ restingValue
      if (mask === 0) return

      bindings.push({
        type: 'hid',
        reportId,
        byteIndex,
        mask,
        activeValue: value & mask,
      })
    })
  })

  return bindings.sort(
    (left, right) =>
      bitCount(left.mask) - bitCount(right.mask) ||
      left.reportId - right.reportId ||
      left.byteIndex - right.byteIndex,
  )
}

export function hidBindingActive(
  reports: HidReports,
  binding: HidBinding,
): boolean {
  const value = reports.get(binding.reportId)?.[binding.byteIndex]
  if (value === undefined) return false
  return (value & binding.mask) === binding.activeValue
}
