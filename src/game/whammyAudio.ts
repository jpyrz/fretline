export interface WhammyAudioParameters {
  baseDelaySeconds: number
  modulationDepthSeconds: number
  modulationFrequencyHz: number
}

export function whammyAudioParameters(
  amount: number,
): WhammyAudioParameters {
  const normalizedAmount = Math.max(0, Math.min(1, amount))

  return {
    baseDelaySeconds: normalizedAmount * 0.006,
    modulationDepthSeconds: normalizedAmount * 0.0045,
    modulationFrequencyHz: 5 + normalizedAmount * 2,
  }
}
