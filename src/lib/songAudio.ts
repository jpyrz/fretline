import { decodeAudioFiles } from './songImport'
import {
  audioFileMetadata,
  materializeSongFiles,
  persistSong,
} from './songLibrary'
import type { LocalSong } from '../types/game'

const decodedAudio = new Map<string, Promise<AudioBuffer[]>>()
const MAX_CACHED_SONGS = 3
let decoderContext: AudioContext | null = null
let preparedGameplayContext: AudioContext | null = null
const gameplayContexts = new WeakSet<AudioContext>()

function getDecoderContext(): AudioContext {
  if (!decoderContext || decoderContext.state === 'closed') {
    decoderContext = new AudioContext({ latencyHint: 'interactive' })
  }
  return decoderContext
}

function resumeDecoder(): void {
  void getDecoderContext()
    .resume()
    .catch(() => undefined)
}

function audioCacheKey(song: LocalSong): string {
  const files = audioFileMetadata(song)
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join('|')
  return `${song.id}:${files}`
}

export function decodeSongAudio(
  song: LocalSong,
  audioContext?: AudioContext,
): Promise<AudioBuffer[]> {
  const key = audioCacheKey(song)
  const existing = decodedAudio.get(key)
  if (existing) {
    decodedAudio.delete(key)
    decodedAudio.set(key, existing)
    return existing
  }

  const context = audioContext ?? getDecoderContext()
  if (!audioContext) resumeDecoder()

  const pending = materializeSongFiles(song)
    .then(async (materializedSong) => {
      const buffers = await decodeAudioFiles(
        context,
        materializedSong.audioFiles,
      )
      if (song.legacyPersistedFiles) {
        void persistSong(materializedSong).catch(() => undefined)
      }
      return buffers
    })
    .catch((error: unknown) => {
      decodedAudio.delete(key)
      if (song.legacyPersistedFiles) {
        throw new Error(
          `The saved copy of ${song.chart.metadata.name} could not be restored on this device. Sync its Google Drive folder again.`,
          { cause: error },
        )
      }
      throw error
    })
  decodedAudio.set(key, pending)
  while (decodedAudio.size > MAX_CACHED_SONGS) {
    const oldestKey = decodedAudio.keys().next().value
    if (!oldestKey || oldestKey === key) break
    decodedAudio.delete(oldestKey)
  }
  return pending
}

export function prepareGameplayAudioContext(): AudioContext {
  if (preparedGameplayContext) {
    void preparedGameplayContext.close()
  }
  if (decoderContext?.state === 'running') {
    preparedGameplayContext = decoderContext
    decoderContext = null
    gameplayContexts.add(preparedGameplayContext)
    return preparedGameplayContext
  }
  preparedGameplayContext = new AudioContext({ latencyHint: 'interactive' })
  gameplayContexts.add(preparedGameplayContext)
  void preparedGameplayContext.resume().catch(() => undefined)
  return preparedGameplayContext
}

export function takePreparedGameplayAudioContext(): AudioContext | null {
  const context = preparedGameplayContext
  preparedGameplayContext = null
  return context
}

export function discardPreparedGameplayAudioContext(
  context?: AudioContext,
): void {
  if (context && preparedGameplayContext !== context) {
    void context.close()
    return
  }
  void preparedGameplayContext?.close()
  preparedGameplayContext = null
}
