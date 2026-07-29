export const LOADING_PHRASES = [
  'Counting the green M&Ms',
  'Looking for our drummer',
  'Warming up the amp',
  'Untangling the patch cables',
  'Turning everything up to eleven',
  'Blaming the bass player',
  'Checking the setlist twice',
  'Tuning the orange fret',
]

export function pickLoadingPhrase(): string {
  return LOADING_PHRASES[
    Math.floor(Math.random() * LOADING_PHRASES.length)
  ]
}
