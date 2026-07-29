import { useEffect, useRef, useState } from 'react'
import {
  decodeSongAudio,
  registerPreviewAudioContext,
  releasePreviewAudioContext,
  unlockSongAudioDecoder,
} from '../lib/songAudio'
import type { LocalSong } from '../types/game'

export type SongPreviewStatus =
  | 'idle'
  | 'loading'
  | 'waiting'
  | 'playing'
  | 'error'

interface ActivePreview {
  gain: GainNode
  sources: AudioBufferSourceNode[]
}

function previewOffset(song: LocalSong, buffers: AudioBuffer[]): number {
  const longestDuration = Math.max(...buffers.map((buffer) => buffer.duration))
  const requested = song.previewStartSeconds ?? longestDuration * 0.22
  return Math.max(0, Math.min(requested, Math.max(0, longestDuration - 1)))
}

export function useSongPreview(
  song: LocalSong | null,
  enabled = true,
): SongPreviewStatus {
  const [status, setStatus] = useState<SongPreviewStatus>('idle')
  const contextRef = useRef<AudioContext | null>(null)
  const outputRef = useRef<AudioNode | null>(null)
  const activeRef = useRef<ActivePreview | null>(null)
  const pendingRef = useRef<{
    song: LocalSong
    buffers: AudioBuffer[]
  } | null>(null)
  const unlockRef = useRef<() => void>(() => undefined)

  const fadeActive = () => {
    const active = activeRef.current
    const context = contextRef.current
    if (!active || !context) return
    const now = context.currentTime
    active.gain.gain.cancelScheduledValues(now)
    active.gain.gain.setValueAtTime(active.gain.gain.value, now)
    active.gain.gain.linearRampToValueAtTime(0, now + 0.14)
    window.setTimeout(() => {
      for (const source of active.sources) {
        try {
          source.stop()
        } catch {
          // A preview source may have naturally ended.
        }
      }
    }, 180)
    if (activeRef.current === active) activeRef.current = null
  }

  useEffect(() => {
    const unlock = () => unlockRef.current()
    const unlockAudio = () => {
      unlockSongAudioDecoder()
      unlock()
    }
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    window.addEventListener('fretline:controller-action', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener(
        'fretline:controller-action',
        unlockAudio,
      )
    }
  }, [])

  useEffect(() => {
    if (!song || !enabled) {
      pendingRef.current = null
      fadeActive()
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')

    const timer = window.setTimeout(() => {
      void (async () => {
        let context = contextRef.current
        if (!context || context.state === 'closed') {
          context = new AudioContext({ latencyHint: 'interactive' })
          const compressor = context.createDynamicsCompressor()
          compressor.connect(context.destination)
          contextRef.current = context
          outputRef.current = compressor
          registerPreviewAudioContext(context)
        }

        const playPending = () => {
          const pending = pendingRef.current
          const currentContext = contextRef.current
          const output = outputRef.current
          if (
            !pending ||
            !currentContext ||
            !output ||
            currentContext.state !== 'running'
          ) {
            return
          }

          pendingRef.current = null
          fadeActive()
          const now = currentContext.currentTime
          const gain = currentContext.createGain()
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.52, now + 0.16)
          gain.connect(output)
          const offset = previewOffset(pending.song, pending.buffers)
          const startAt = now + 0.03
          const sources = pending.buffers
            .filter((buffer) => buffer.duration > offset)
            .map((buffer) => {
              const source = currentContext.createBufferSource()
              source.buffer = buffer
              source.connect(gain)
              source.start(startAt, offset)
              return source
            })

          activeRef.current = { gain, sources }
          setStatus('playing')
        }

        unlockRef.current = () => {
          const currentContext = contextRef.current
          if (!currentContext) return
          void currentContext.resume().then(() => {
            if (currentContext.state === 'running') playPending()
          })
        }

        try {
          const buffers = await decodeSongAudio(song)
          if (cancelled) return
          pendingRef.current = { song, buffers }
          await context.resume()
          if (cancelled) return
          if (context.state === 'running') {
            playPending()
          } else {
            setStatus('waiting')
          }
        } catch {
          if (!cancelled) setStatus('error')
        }
      })()
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (pendingRef.current?.song.id === song.id) {
        pendingRef.current = null
      }
    }
  }, [enabled, song])

  useEffect(
    () => () => {
      pendingRef.current = null
      fadeActive()
      unlockRef.current = () => undefined
      const context = contextRef.current
      if (context && !releasePreviewAudioContext(context)) {
        void context.close()
      }
      contextRef.current = null
      outputRef.current = null
    },
    [],
  )

  return status
}
