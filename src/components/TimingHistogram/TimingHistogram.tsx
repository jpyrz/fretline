import type { HitRecord } from '../../types/game'
import styles from './TimingHistogram.module.scss'

const BINS = [-100, -75, -50, -25, 0, 25, 50, 75, 100]

export function TimingHistogram({ records }: { records: HitRecord[] }) {
  const hits = records.filter((record) => record.result === 'hit')
  const counts = BINS.map((center) =>
    hits.filter((record) => Math.abs(record.errorMs - center) <= 12.5).length,
  )
  const max = Math.max(1, ...counts)

  return (
    <div className={styles.wrapper} aria-label="Hit timing histogram">
      <div className={styles.chart}>
        {counts.map((count, index) => (
          <div key={BINS[index]} className={styles.bin}>
            <span style={{ height: `${Math.max(4, (count / max) * 100)}%` }} />
          </div>
        ))}
        <i />
      </div>
      <div className={styles.labels}>
        <span>Early</span>
        <strong>Perfect</strong>
        <span>Late</span>
      </div>
    </div>
  )
}
