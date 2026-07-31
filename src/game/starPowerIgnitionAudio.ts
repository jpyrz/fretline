const IGNITION_DURATION_SECONDS = 0.42

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect()
  } catch {
    // A browser may have already disconnected a completed one-shot node.
  }
}

/**
 * Plays a short, synthesized electrical surge without loading another asset.
 * The effect is intentionally one-shot so star power adds impact without
 * creating a continuous mobile CPU or battery cost.
 */
export function playStarPowerIgnition(
  audioContext: AudioContext,
  destination: AudioNode,
): void {
  const startAt = audioContext.currentTime
  const endAt = startAt + IGNITION_DURATION_SECONDS
  const output = audioContext.createGain()
  const filter = audioContext.createBiquadFilter()
  const surge = audioContext.createOscillator()
  const impact = audioContext.createOscillator()
  const impactGain = audioContext.createGain()
  const noise = audioContext.createBufferSource()

  output.gain.setValueAtTime(0.0001, startAt)
  output.gain.exponentialRampToValueAtTime(0.18, startAt + 0.012)
  output.gain.exponentialRampToValueAtTime(0.055, startAt + 0.16)
  output.gain.exponentialRampToValueAtTime(0.0001, endAt)

  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(2_400, startAt)
  filter.frequency.exponentialRampToValueAtTime(420, endAt)
  filter.Q.value = 1.4

  surge.type = 'sawtooth'
  surge.frequency.setValueAtTime(1_300, startAt)
  surge.frequency.exponentialRampToValueAtTime(95, endAt)

  impact.type = 'triangle'
  impact.frequency.setValueAtTime(92, startAt)
  impact.frequency.exponentialRampToValueAtTime(42, startAt + 0.22)
  impactGain.gain.setValueAtTime(0.34, startAt)
  impactGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.25)

  const noiseBuffer = audioContext.createBuffer(
    1,
    Math.ceil(audioContext.sampleRate * IGNITION_DURATION_SECONDS),
    audioContext.sampleRate,
  )
  const noiseData = noiseBuffer.getChannelData(0)
  for (let index = 0; index < noiseData.length; index += 1) {
    const decay = 1 - index / noiseData.length
    noiseData[index] = (Math.random() * 2 - 1) * decay
  }
  noise.buffer = noiseBuffer

  surge.connect(filter)
  noise.connect(filter)
  filter.connect(output)
  impact.connect(impactGain)
  impactGain.connect(output)
  output.connect(destination)

  surge.start(startAt)
  impact.start(startAt)
  noise.start(startAt)
  surge.stop(endAt)
  impact.stop(startAt + 0.25)

  noise.onended = () => {
    safeDisconnect(surge)
    safeDisconnect(impact)
    safeDisconnect(noise)
    safeDisconnect(impactGain)
    safeDisconnect(filter)
    safeDisconnect(output)
  }
}
