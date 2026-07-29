import type { ChartMetadata } from '../types/game'

export interface SongIniMetadata
  extends Pick<
    ChartMetadata,
    'name' | 'artist' | 'charter' | 'offsetSeconds'
  > {
  previewStartSeconds?: number
}

function cleanValue(value: string): string {
  const trimmed = value.trim()
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed
  return unquoted.replace(/<[^>]+>/g, '').trim()
}

export function parseSongIni(source: string): SongIniMetadata {
  const values = new Map<string, string>()
  let inSongSection = false

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      inSongSection = line.slice(1, -1).trim().toLowerCase() === 'song'
      continue
    }
    if (!inSongSection) continue
    const separator = line.indexOf('=')
    if (separator < 0) continue
    values.set(
      line.slice(0, separator).trim().toLowerCase(),
      cleanValue(line.slice(separator + 1)),
    )
  }

  const delayMs = Number(values.get('delay') ?? 0)
  const previewStartMs = Number(values.get('preview_start_time'))
  return {
    name: values.get('name') || 'Untitled chart',
    artist: values.get('artist') || 'Unknown artist',
    charter:
      values.get('charter') || values.get('frets') || 'Unknown charter',
    offsetSeconds: Number.isFinite(delayMs) ? delayMs / 1000 : 0,
    previewStartSeconds:
      Number.isFinite(previewStartMs) && previewStartMs >= 0
        ? previewStartMs / 1000
        : undefined,
  }
}
