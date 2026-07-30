import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { decodeSongAudio } from '../lib/songAudio'
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

export function useHomeAudio(songs: LocalSong[]): HomeAudioState {
  const [songId, setSongId] = useState<string | null>(null)
  const [status, setStatus] = useState<HomeAudioStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)
  const gainRef = useRef<GainNode | null>(null)
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
    const gain = gainRef.current
    if (!gain) return
    gain.gain.setTargetAtTime(muted ? 0 : 0.58, gain.context.currentTime, 0.025)
  }, [muted])

  useEffect(() => {
    if (!currentSong) {
      setStatus('idle')
      setProgress(0)
      return
    }

    let cancelled = false
    let started = false
    let buffers: AudioBuffer[] | null = null
    let sources: AudioBufferSourceNode[] = []
    let startedAt = 0
    let duration = 0
    let frame = 0
    let remainingSources = 0
    const audioContext = new AudioContext({ latencyHint: 'playback' })
    const masterGain = audioContext.createGain()
    const compressor = audioContext.createDynamicsCompressor()
    masterGain.gain.value = mutedRef.current ? 0 : 0.58
    masterGain.connect(compressor)
    compressor.connect(audioContext.destination)
    gainRef.current = masterGain

    const updateProgress = () => {
      if (!cancelled && started && duration > 0) {
        setProgress(
          Math.max(
            0,
            Math.min(1, (audioContext.currentTime - startedAt) / duration),
          ),
        )
      }
      frame = requestAnimationFrame(updateProgress)
    }

    const startSources = () => {
      if (
        cancelled ||
        started ||
        !buffers ||
        audioContext.state !== 'running'
      ) {
        return
      }
      started = true
      sources = buffers.map((buffer) => {
        const source = audioContext.createBufferSource()
        source.buffer = buffer
        source.connect(masterGain)
        return source
      })
      remainingSources = sources.length
      startedAt = audioContext.currentTime + 0.04
      for (const source of sources) {
        source.onended = () => {
          remainingSources -= 1
          if (!cancelled && remainingSources === 0) advanceRef.current()
        }
        source.start(startedAt)
      }
      setStatus('playing')
    }

    const unlockAndStart = () => {
      if (cancelled) return
      if (audioContext.state === 'running') {
        startSources()
        return
      }
      void audioContext
        .resume()
        .then(startSources)
        .catch(() => {
          if (!cancelled) setStatus('waiting')
        })
    }
    startRef.current = unlockAndStart

    const handleControllerAction = () => unlockAndStart()
    window.addEventListener('pointerdown', unlockAndStart)
    window.addEventListener('keydown', unlockAndStart)
    window.addEventListener(
      'fretline:controller-action',
      handleControllerAction,
    )

    setStatus('loading')
    setProgress(0)
    frame = requestAnimationFrame(updateProgress)

    void decodeSongAudio(currentSong)
      .then((decoded) => {
        if (cancelled) return
        buffers = decoded
        duration = Math.max(...decoded.map((buffer) => buffer.duration))
        if (audioContext.state !== 'running') setStatus('waiting')
        unlockAndStart()
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', unlockAndStart)
      window.removeEventListener('keydown', unlockAndStart)
      window.removeEventListener(
        'fretline:controller-action',
        handleControllerAction,
      )
      for (const source of sources) {
        try {
          source.stop()
        } catch {
          // The source may already have ended.
        }
      }
      if (gainRef.current === masterGain) gainRef.current = null
      if (startRef.current === unlockAndStart) {
        startRef.current = () => undefined
      }
      void audioContext.close()
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
