import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Lane } from '../../../../types/game'
import { TouchContactTracker } from './touchContacts'
import styles from './TouchControls.module.scss'

const LANE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange']

interface TouchControlsProps {
  onTap: (lanes: Lane[], timestamp: number) => void
  onFretChange: (lanes: Lane[], timestamp: number) => void
  onLanesChange: (lanes: Lane[]) => void
  onStarPower: (timestamp: number) => void
  onWhammy: (amount: number) => void
}

export function TouchControls({
  onTap,
  onFretChange,
  onLanesChange,
  onStarPower,
  onWhammy,
}: TouchControlsProps) {
  const trackerRef = useRef(new TouchContactTracker())
  const lanesRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const whammyPointerRef = useRef<number | null>(null)
  const [activeLanes, setActiveLanes] = useState<Lane[]>([])
  const [openActive, setOpenActive] = useState(false)
  const [whammyAmount, setWhammyAmount] = useState(0)

  const publishContacts = () => {
    const snapshot = trackerRef.current.snapshot()
    setActiveLanes(snapshot.lanes)
    setOpenActive(snapshot.open)
    onLanesChange(snapshot.lanes)
  }

  const scheduleTap = () => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      const pending = trackerRef.current.consumePendingTap()
      if (!pending) return
      onTap(pending.open ? [] : pending.lanes, pending.timestamp)
      publishContacts()
    })
  }

  const pressContact = (
    event: ReactPointerEvent<HTMLButtonElement>,
    lane: Lane | null,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    trackerRef.current.press(event.pointerId, lane, event.timeStamp)
    publishContacts()
    scheduleTap()
  }

  const releaseContact = (
    event: ReactPointerEvent<HTMLButtonElement>,
    lane: Lane | null,
  ) => {
    event.preventDefault()
    const releaseType = trackerRef.current.release(event.pointerId)
    publishContacts()
    if (releaseType === 'held' && lane !== null) {
      onFretChange(trackerRef.current.snapshot().lanes, event.timeStamp)
    }
  }

  const moveContact = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const bounds = lanesRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return

    const progress = Math.max(
      0,
      Math.min(0.999, (event.clientX - bounds.left) / bounds.width),
    )
    const lane = Math.floor(progress * LANE_NAMES.length) as Lane
    const moveType = trackerRef.current.move(event.pointerId, lane)
    if (!moveType) return

    event.preventDefault()
    publishContacts()
    if (moveType === 'held') {
      onFretChange(trackerRef.current.snapshot().lanes, event.timeStamp)
    }
  }

  const updateWhammy = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const amount = Math.max(
      0,
      Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height),
    )
    setWhammyAmount(amount)
    onWhammy(amount)
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      trackerRef.current.reset()
      onLanesChange([])
      onWhammy(0)
    },
    [onLanesChange, onWhammy],
  )

  return (
    <div className={styles.controls} aria-label="Tap controls">
      <button
        type="button"
        className={styles.power}
        aria-label="Activate Star Power"
        onPointerDown={(event) => {
          event.preventDefault()
          onStarPower(event.timeStamp)
        }}
      >
        <span aria-hidden="true">★</span>
        Power
      </button>

      <button
        type="button"
        className={styles.open}
        data-active={openActive || undefined}
        aria-label="Open note"
        onPointerDown={(event) => pressContact(event, null)}
        onPointerUp={(event) => releaseContact(event, null)}
        onPointerCancel={(event) => releaseContact(event, null)}
        onLostPointerCapture={(event) => releaseContact(event, null)}
      >
        Open
      </button>

      <button
        type="button"
        className={styles.whammy}
        aria-label="Whammy"
        style={{ '--whammy': whammyAmount } as React.CSSProperties}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          whammyPointerRef.current = event.pointerId
          updateWhammy(event)
        }}
        onPointerMove={(event) => {
          if (whammyPointerRef.current === event.pointerId) {
            updateWhammy(event)
          }
        }}
        onPointerUp={(event) => {
          if (whammyPointerRef.current !== event.pointerId) return
          whammyPointerRef.current = null
          setWhammyAmount(0)
          onWhammy(0)
        }}
        onPointerCancel={() => {
          whammyPointerRef.current = null
          setWhammyAmount(0)
          onWhammy(0)
        }}
        onLostPointerCapture={() => {
          whammyPointerRef.current = null
          setWhammyAmount(0)
          onWhammy(0)
        }}
      >
        <span aria-hidden="true" />
        Whammy
      </button>

      <div className={styles.lanes} ref={lanesRef}>
        {LANE_NAMES.map((name, index) => {
          const lane = index as Lane
          return (
            <button
              type="button"
              key={name}
              data-lane={lane}
              data-active={activeLanes.includes(lane) || undefined}
              aria-label={`${name} lane`}
              onPointerDown={(event) => pressContact(event, lane)}
              onPointerMove={moveContact}
              onPointerUp={(event) => releaseContact(event, lane)}
              onPointerCancel={(event) => releaseContact(event, lane)}
              onLostPointerCapture={(event) =>
                releaseContact(event, lane)
              }
            >
              <span aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
