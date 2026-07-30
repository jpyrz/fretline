import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalSong } from '../types/game'

type HomeAudioStatus = 'idle' | 'loading' | 'waiting' | 'playing' | 'error'

interface HomeAudioState {
  currentSong: LocalSong | null
  status: HomeAudioStatus
  progress: number
  muted: boolean
  start: () => void
  toggleMuted: () => void
}

interface HomeAudioTrack {
  audio: HTMLAudioElement
  objectUrl: string
}

function randomSongId(
  songs: LocalSong[],
  currentId: string | null = null,
): string | null {
  if (songs.length === 0) return null
  const choices =
    songs.length > 1
      ? songs.filter((candidate) => candidate.id !== currentId)
      : songs
  return choices[Math.floor(Math.random() * choices.length)]?.id ?? null
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
      reject(new Error('The home audio could not be loaded.'))
    }
    const aborted = () => {
      cleanup()
      reject(new DOMException('Home audio superseded.', 'AbortError'))
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

function disposeTracks(tracks: HomeAudioTrack[]): void {
  for (const track of tracks) {
    track.audio.pause()
    track.audio.removeAttribute('src')
    track.audio.load()
    URL.revokeObjectURL(track.objectUrl)
  }
}

export function useHomeAudio(songs: LocalSong[]): HomeAudioState {
  const [songId, setSongId] = useState<string | null>(null)
  const [status, setStatus] = useState<HomeAudioStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)
  const tracksRef = useRef<HomeAudioTrack[]>([])
  const startRef = useRef<() => void>(() => undefined)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const songsRef = useRef(songs)
  songsRef.current = songs

  const currentSong = useMemo(
    () => songs.find((candidate) => candidate.id === songId) ?? null,
    [songId, songs],
  )

  const advance = useCallback(() => {
    setSongId((current) => randomSongId(songsRef.current, current))
  }, [])
  const advanceRef = useRef(advance)
  advanceRef.current = advance

  useEffect(() => {
    if (songs.length === 0) {
      setSongId(null)
      return
    }
    setSongId((current) =>
      current && songs.some((candidate) => candidate.id === current)
        ? current
        : randomSongId(songs),
    )
  }, [songs])

  useEffect(() => {
    const volume = muted ? 0 : 0.58
    for (const track of tracksRef.current) {
      track.audio.volume = volume
    }
  }, [muted])

  useEffect(() => {
    if (!currentSong || currentSong.audioFiles.length === 0) {
      setStatus('idle')
      setProgress(0)
      return
    }

    let cancelled = false
    let playbackState: 'idle' | 'starting' | 'playing' = 'idle'
    let duration = 0
    let frame = 0
    let remainingTracks = 0
    const abortController = new AbortController()
    const tracks = currentSong.audioFiles.map((file) => {
      const audio = new Audio()
      const objectUrl = URL.createObjectURL(file)
      audio.preload = 'auto'
      audio.volume = mutedRef.current ? 0 : 0.58
      audio.src = objectUrl
      return { audio, objectUrl }
    })
    tracksRef.current = tracks

    const updateProgress = () => {
      if (!cancelled && playbackState === 'playing' && duration > 0) {
        const currentTime = Math.max(
          0,
          ...tracks.map((track) => track.audio.currentTime),
        )
        setProgress(Math.max(0, Math.min(1, currentTime / duration)))
      }
      frame = requestAnimationFrame(updateProgress)
    }

    const startTracks = async () => {
      if (cancelled || playbackState !== 'idle') return
      playbackState = 'starting'
      try {
        for (const track of tracks) track.audio.currentTime = 0
        await Promise.all(tracks.map((track) => track.audio.play()))
        if (cancelled) {
          disposeTracks(tracks)
          return
        }
        playbackState = 'playing'
        startRef.current = () => undefined
        setStatus('playing')
      } catch (reason) {
        if (cancelled) return
        playbackState = 'idle'
        for (const track of tracks) track.audio.pause()
        if (
          reason instanceof DOMException &&
          reason.name === 'NotAllowedError'
        ) {
          setStatus('waiting')
          return
        }
        setStatus('error')
      }
    }

    const unlockAndStart = () => void startTracks()
    startRef.current = unlockAndStart
    window.addEventListener('pointerdown', unlockAndStart)
    window.addEventListener('keydown', unlockAndStart)
    window.addEventListener('fretline:controller-action', unlockAndStart)

    setStatus('loading')
    setProgress(0)
    frame = requestAnimationFrame(updateProgress)

    void Promise.all(
      tracks.map((track) =>
        waitForMetadata(track.audio, abortController.signal),
      ),
    )
      .then(() => {
        if (cancelled) return
        duration = Math.max(...tracks.map((track) => track.audio.duration))
        remainingTracks = tracks.length
        for (const track of tracks) {
          track.audio.onended = () => {
            remainingTracks -= 1
            if (!cancelled && remainingTracks === 0) {
              advanceRef.current()
            }
          }
        }
        void startTracks()
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      abortController.abort()
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', unlockAndStart)
      window.removeEventListener('keydown', unlockAndStart)
      window.removeEventListener('fretline:controller-action', unlockAndStart)
      disposeTracks(tracks)
      if (tracksRef.current === tracks) tracksRef.current = []
      if (startRef.current === unlockAndStart) {
        startRef.current = () => undefined
      }
    }
  }, [currentSong])

  return {
    currentSong,
    status,
    progress,
    muted,
    start: () => startRef.current(),
    toggleMuted: () => setMuted((current) => !current),
  }
}
