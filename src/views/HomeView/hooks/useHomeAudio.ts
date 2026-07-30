import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepareSongPreview } from '../../../lib/songPreviewCache'
import type { LocalSong } from '../../../types/game'

type HomeAudioStatus = 'idle' | 'loading' | 'waiting' | 'playing' | 'error'

interface HomeAudioState {
  currentSong: LocalSong | null
  status: HomeAudioStatus
  progress: number
  muted: boolean
  start: () => void
  toggleMuted: () => void
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

export function useHomeAudio(
  songs: LocalSong[],
  initiallyMuted = false,
): HomeAudioState {
  const [songId, setSongId] = useState<string | null>(null)
  const [status, setStatus] = useState<HomeAudioStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(initiallyMuted)
  const audioRef = useRef<HTMLAudioElement | null>(null)
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
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : 0.58
    }
  }, [muted])

  useEffect(() => {
    if (!currentSong) {
      setStatus('idle')
      setProgress(0)
      return
    }

    let cancelled = false
    let playbackState: 'idle' | 'starting' | 'playing' = 'idle'
    let audio: HTMLAudioElement | null = null
    let objectUrl = ''

    const updateProgress = () => {
      if (
        !cancelled &&
        audio &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
      ) {
        setProgress(Math.max(0, Math.min(1, audio.currentTime / audio.duration)))
      }
    }

    const startAudio = async () => {
      if (cancelled || !audio || playbackState !== 'idle') return
      playbackState = 'starting'
      try {
        audio.currentTime = 0
        await audio.play()
        if (cancelled) return
        playbackState = 'playing'
        startRef.current = () => undefined
        setStatus('playing')
      } catch (reason) {
        if (cancelled) return
        playbackState = 'idle'
        audio.pause()
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

    const unlockAndStart = () => void startAudio()
    const handleVisibilityChange = () => {
      if (!audio) return
      if (document.hidden) {
        audio.pause()
        return
      }
      if (playbackState === 'playing') {
        void audio.play().catch(() => setStatus('waiting'))
      }
    }
    startRef.current = unlockAndStart
    window.addEventListener('pointerdown', unlockAndStart)
    window.addEventListener('keydown', unlockAndStart)
    window.addEventListener('fretline:controller-action', unlockAndStart)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    setStatus('loading')
    setProgress(0)

    void prepareSongPreview(currentSong)
      .then((file) => {
        if (cancelled) return
        audio = new Audio()
        objectUrl = URL.createObjectURL(file)
        audio.preload = 'auto'
        audio.volume = mutedRef.current ? 0 : 0.58
        audio.src = objectUrl
        audio.onended = () => {
          if (!cancelled) advanceRef.current()
        }
        audio.addEventListener('timeupdate', updateProgress)
        audio.addEventListener('loadedmetadata', updateProgress)
        audioRef.current = audio
        void startAudio()
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', unlockAndStart)
      window.removeEventListener('keydown', unlockAndStart)
      window.removeEventListener('fretline:controller-action', unlockAndStart)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      audio?.pause()
      if (audio) {
        audio.removeEventListener('timeupdate', updateProgress)
        audio.removeEventListener('loadedmetadata', updateProgress)
        audio.removeAttribute('src')
        audio.load()
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (audioRef.current === audio) audioRef.current = null
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
