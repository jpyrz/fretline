import { useEffect, useRef, useState } from 'react'
import { prepareSongPreview } from '../../../lib/songPreviewCache'
import type { LocalSong } from '../../../types/game'

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
    const progress = Math.max(
      0,
      Math.min(1, (now - startedAt) / durationMs),
    )
    preview.audio.volume = Math.max(
      0,
      Math.min(
        1,
        initialVolume + (targetVolume - initialVolume) * progress,
      ),
    )
    if (progress < 1) {
      preview.animationFrame = requestAnimationFrame(update)
      return
    }
    onComplete?.()
  }

  preview.animationFrame = requestAnimationFrame(update)
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
    const handleVisibilityChange = () => {
      const active = activeRef.current
      if (!active) return
      if (document.hidden) {
        active.audio.pause()
        return
      }
      void active.audio.play().catch(() => setStatus('waiting'))
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('fretline:controller-action', unlock)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('fretline:controller-action', unlock)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
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

    let cancelled = false
    setStatus('loading')

    const timer = window.setTimeout(() => {
      void prepareSongPreview(song)
        .then(async (file) => {
          if (cancelled) return
          const audio = new Audio()
          const objectUrl = URL.createObjectURL(file)
          audio.preload = 'auto'
          audio.volume = 0
          audio.src = objectUrl
          const preview: ActivePreview = {
            audio,
            objectUrl,
            animationFrame: 0,
            disposed: false,
          }
          pendingRef.current = preview
          let playbackState: 'idle' | 'starting' | 'playing' = 'idle'

          const beginPlayback = async () => {
            if (
              cancelled ||
              preview.disposed ||
              playbackState !== 'idle'
            ) {
              return
            }
            playbackState = 'starting'
            try {
              audio.currentTime = 0
              await audio.play()
              if (cancelled || preview.disposed) {
                disposePreview(preview)
                return
              }
              pendingRef.current = null
              activeRef.current = preview
              playbackState = 'playing'
              unlockRef.current = () => undefined
              fadePreview(preview, 0.52, 160)
              setStatus('playing')
            } catch (reason) {
              if (cancelled || preview.disposed) return
              playbackState = 'idle'
              if (
                reason instanceof DOMException &&
                reason.name === 'NotAllowedError'
              ) {
                audio.pause()
                setStatus('waiting')
                return
              }
              disposePreview(preview)
              pendingRef.current = null
              setStatus('error')
            }
          }

          unlockRef.current = () => void beginPlayback()
          await beginPlayback()
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    }, 180)

    return () => {
      cancelled = true
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
