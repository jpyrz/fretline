import { useEffect, useState } from 'react'
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
    if (!song.artworkFile) {
      setSource('')
      return
    }
    const url = URL.createObjectURL(song.artworkFile)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [song.artworkFile])

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
