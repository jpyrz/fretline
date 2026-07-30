import { useEffect, useState } from 'react'
import { loadSongArtwork } from '../lib/songLibrary'
import type { LocalSong } from '../types/game'
import styles from './AlbumArtwork.module.scss'

interface AlbumArtworkProps {
  song: LocalSong
  compact?: boolean
}

function initials(song: LocalSong): string {
  return song.chart.metadata.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function AlbumArtwork({ song, compact = false }: AlbumArtworkProps) {
  const [source, setSource] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource('')
    void loadSongArtwork(song)
      .then((artworkFile) => {
        if (!active || !artworkFile) return
        objectUrl = URL.createObjectURL(artworkFile)
        setSource(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [song])

  return (
    <div
      className={styles.artwork}
      data-compact={compact}
      data-placeholder={!source}
    >
      {source ? (
        <img
          src={source}
          alt={`${song.chart.metadata.name} album artwork`}
        />
      ) : (
        <>
          <span>{initials(song) || 'FL'}</span>
          <small>Fretline</small>
        </>
      )}
    </div>
  )
}
