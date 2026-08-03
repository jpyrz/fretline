import type { AchievementIcon } from '../../types'

export function AchievementGlyph({ icon }: { icon: AchievementIcon }) {
  if (icon === 'note') return <span aria-hidden="true">♪</span>
  if (icon === 'crown') return <span aria-hidden="true">♛</span>
  if (icon === 'spark') return <span aria-hidden="true">✦</span>
  if (icon === 'star') return <span aria-hidden="true">★</span>
  if (icon === 'road') return <span aria-hidden="true">Ⅱ</span>
  return <span aria-hidden="true">Ⅹ</span>
}
