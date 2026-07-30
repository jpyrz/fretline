import { forwardRef } from 'react'
import styles from './HighwayCanvas.module.scss'

export const HighwayCanvas = forwardRef<HTMLCanvasElement>(
  function HighwayCanvas(_props, ref) {
    return (
      <canvas
        ref={ref}
        className={styles.canvas}
        aria-label="Five-lane guitar note highway"
      />
    )
  },
)
