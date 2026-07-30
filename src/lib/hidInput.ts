import type { HidAnalogBinding, HidBinding } from '../types/game'

export type HidReports = ReadonlyMap<number, Uint8Array>

export function hidByteKey(reportId: number, byteIndex: number): string {
  return `${reportId}:${byteIndex}`
}

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
  ignoredBytes: ReadonlySet<string> = new Set(),
): HidBinding[] {
  const bindings: HidBinding[] = []

  reports.forEach((bytes, reportId) => {
    const restingBytes = baseline.get(reportId)
    if (!restingBytes) return

    bytes.forEach((value, byteIndex) => {
      if (ignoredBytes.has(hidByteKey(reportId, byteIndex))) return
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

export function changedHidBytes(
  reports: HidReports,
  reference: HidReports,
): Set<string> {
  const changed = new Set<string>()

  reports.forEach((bytes, reportId) => {
    const referenceBytes = reference.get(reportId)
    if (!referenceBytes) return

    bytes.forEach((value, byteIndex) => {
      if (
        referenceBytes[byteIndex] !== undefined &&
        value !== referenceBytes[byteIndex]
      ) {
        changed.add(hidByteKey(reportId, byteIndex))
      }
    })
  })

  return changed
}

export function hidBindingActive(
  reports: HidReports,
  binding: HidBinding,
): boolean {
  const value = reports.get(binding.reportId)?.[binding.byteIndex]
  if (value === undefined) return false
  return (value & binding.mask) === binding.activeValue
}

export function hidAnalogValue(
  reports: HidReports,
  binding?: HidAnalogBinding,
): number {
  if (!binding) return 0
  const current = reports.get(binding.reportId)?.[binding.byteIndex]
  if (current === undefined) return 0
  const travel = binding.value - binding.rest
  if (Math.abs(travel) < 1) return 0
  return Math.max(0, Math.min(1, (current - binding.rest) / travel))
}
