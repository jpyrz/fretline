import { HANDITAP_VERSION } from '../../game/handiTap/handiTap'
import type { PlayInputMode } from '../../lib/inputMode'

interface ChartIdentity {
  songId: string
  trackName: string
  inputMode: PlayInputMode
}

export function profileChartKey({
  songId,
  trackName,
  inputMode,
}: ChartIdentity): string {
  const rulesVersion =
    inputMode === 'tap' ? `handitap-${HANDITAP_VERSION}` : 'standard-1'
  return JSON.stringify([songId, trackName, inputMode, rulesVersion])
}
