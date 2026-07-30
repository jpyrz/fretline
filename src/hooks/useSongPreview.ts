import { useEffect, useRef, useState } from 'react'
import {
  previewFileForSong,
  previewOffsetSeconds,
} from '../lib/songPreview'
import type { LocalSong } from '../types/game'

export type SongPreviewStatus =
  | 'idle'
  | 'loading'
  | 'waiting'
  | 'playing'
  | 'error'

interface ActivePreview {
  audio: HTMLAudioElement
  objectUrl: string
  animationFrame: number
  disposed: boolean
}

function disposePreview(preview: ActivePreview): void {
  if (preview.disposed) return
  preview.disposed = true
  cancelAnimationFrame(preview.animationFrame)
  preview.audio.pause()
  preview.audio.removeAttribute('src')
  preview.audio.load()
  URL.revokeObjectURL(preview.objectUrl)
}

function fadePreview(
  preview: ActivePreview,
  targetVolume: number,
  durationMs: number,
  onComplete?: () => void,
): void {
  cancelAnimationFrame(preview.animationFrame)
  const initialVolume = preview.audio.volume
  const startedAt = performance.now()

  const update = (now: number) => {
    if (preview.disposed) return
    const progress = Math.min(1, (now - startedAt) / durationMs)
    preview.audio.volume =
      initialVolume + (targetVolume - initialVolume) * progress
    if (progress < 1) {
      preview.animationFrame = requestAnimationFrame(update)
      return
    }
    onComplete?.()
  }

  preview.animationFrame = requestAnimationFrame(update)
}

function waitForMetadata(
  audio: HTMLAudioElement,
  signal: AbortSignal,
): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const loaded = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('The preview audio could not be loaded.'))
    }
    const aborted = () => {
      cleanup()
      reject(new DOMException('Preview superseded.', 'AbortError'))
    }
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', loaded)
      audio.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    audio.addEventListener('loadedmetadata', loaded)
    audio.addEventListener('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}

export function useSongPreview(
  song: LocalSong | null,
  enabled = true,
): SongPreviewStatus {
  const [status, setStatus] = useState<SongPreviewStatus>('idle')
  const activeRef = useRef<ActivePreview | null>(null)
  const pendingRef = useRef<ActivePreview | null>(null)
  const unlockRef = useRef<() => void>(() => undefined)

  const fadeActive = () => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    fadePreview(active, 0, 140, () => disposePreview(active))
  }

  useEffect(() => {
    const unlock = () => unlockRef.current()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('fretline:controller-action', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('fretline:controller-action', unlock)
    }
  }, [])

  useEffect(() => {
    if (pendingRef.current) disposePreview(pendingRef.current)
    pendingRef.current = null
    unlockRef.current = () => undefined
    fadeActive()

    if (!song || !enabled) {
      setStatus('idle')
      return
    }

    const selection = previewFileForSong(song)
    if (!selection) {
      setStatus('error')
      return
    }

    let cancelled = false
    const abortController = new AbortController()
    setStatus('loading')

    const timer = window.setTimeout(() => {
      void (async () => {
        const objectUrl = URL.createObjectURL(selection.file)
        const audio = new Audio()
        const preview: ActivePreview = {
          audio,
          objectUrl,
          animationFrame: 0,
          disposed: false,
        }
        pendingRef.current = preview
        audio.preload = 'auto'
        audio.volume = 0
        audio.src = objectUrl

        const beginPlayback = async () => {
          if (cancelled || preview.disposed) return
          try {
            await audio.play()
            if (cancelled || preview.disposed) {
              disposePreview(preview)
              return
            }
            pendingRef.current = null
            activeRef.current = preview
            fadePreview(preview, 0.52, 160)
            setStatus('playing')
          } catch (reason) {
            if (cancelled || preview.disposed) return
            if (
              reason instanceof DOMException &&
              reason.name === 'NotAllowedError'
            ) {
              setStatus('waiting')
              return
            }
            disposePreview(preview)
            pendingRef.current = null
            setStatus('error')
          }
        }

        unlockRef.current = () => void beginPlayback()

        try {
          await waitForMetadata(audio, abortController.signal)
          if (cancelled || preview.disposed) {
            disposePreview(preview)
            return
          }
          audio.currentTime = previewOffsetSeconds(
            song,
            audio.duration,
            selection.dedicatedPreview,
          )
          await beginPlayback()
        } catch {
          if (!cancelled) setStatus('error')
          disposePreview(preview)
          if (pendingRef.current === preview) pendingRef.current = null
        }
      })()
    }, 180)

    return () => {
      cancelled = true
      abortController.abort()
      window.clearTimeout(timer)
      if (pendingRef.current) {
        disposePreview(pendingRef.current)
        pendingRef.current = null
      }
    }
  }, [enabled, song])

  useEffect(
    () => () => {
      unlockRef.current = () => undefined
      if (pendingRef.current) disposePreview(pendingRef.current)
      if (activeRef.current) disposePreview(activeRef.current)
      pendingRef.current = null
      activeRef.current = null
    },
    [],
  )

  return status
}
