import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Lane } from '../../../../types/game'
import {
  TAP_HIT_LINE_RATIO,
  highwayGuideWidthAtY,
} from '../../../../game/rendering/highwayGeometry'
import { TouchContactTracker } from './touchContacts'
import { TouchWhammyTracker } from './touchWhammy'
import { StarPowerRail } from './StarPowerRail'
import styles from './TouchControls.module.scss'

const LANE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange']
const MIN_WHAMMY_DRAG_PX = 76
const MAX_WHAMMY_DRAG_PX = 120

interface TouchControlsProps {
  highwayLength: number
  entering: boolean
  starPowerActive: boolean
  starPowerMeter: number
  onTap: (lanes: Lane[], timestamp: number) => void
  onFretChange: (lanes: Lane[], timestamp: number) => void
  onLanesChange: (lanes: Lane[]) => void
  onStarPower: (timestamp: number) => void
  onWhammy: (amount: number) => void
}

export function TouchControls({
  highwayLength,
  entering,
  starPowerActive,
  starPowerMeter,
  onTap,
  onFretChange,
  onLanesChange,
  onStarPower,
  onWhammy,
}: TouchControlsProps) {
  const trackerRef = useRef(new TouchContactTracker())
  const whammyTrackerRef = useRef(new TouchWhammyTracker())
  const controlsRef = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const [activeLanes, setActiveLanes] = useState<Lane[]>([])
  const [openActive, setOpenActive] = useState(false)
  useLayoutEffect(() => {
    const controls = controlsRef.current
    const lanes = lanesRef.current
    const target = lanes?.querySelector('span')
    if (!controls || !target) return

    const alignLaneTargets = () => {
      const controlsBounds = controls.getBoundingClientRect()
      const targetBounds = target.getBoundingClientRect()
      const targetCenterY =
        targetBounds.top + targetBounds.height / 2 - controlsBounds.top
      const laneWidth = highwayGuideWidthAtY(
        controlsBounds.width,
        controlsBounds.height,
        targetCenterY,
        highwayLength,
        TAP_HIT_LINE_RATIO,
      )
      controls.style.setProperty('--tap-lane-width', `${laneWidth}px`)
    }

    alignLaneTargets()
    const observer = new ResizeObserver(alignLaneTargets)
    observer.observe(controls)
    observer.observe(target)
    return () => observer.disconnect()
  }, [highwayLength])

  const publishContacts = useCallback(() => {
    const snapshot = trackerRef.current.snapshot()
    setActiveLanes(snapshot.lanes)
    setOpenActive(snapshot.open)
    onLanesChange(snapshot.lanes)
  }, [onLanesChange])

  const releasePointer = useCallback(
    (pointerId: number, timestamp: number) => {
      const lane = trackerRef.current.contact(pointerId)
      const releaseType = trackerRef.current.release(pointerId)
      const whammyAmount = whammyTrackerRef.current.release(pointerId)
      onWhammy(whammyAmount)
      if (!releaseType) return

      publishContacts()
      if (releaseType === 'held' && lane !== null && lane !== undefined) {
        onFretChange(trackerRef.current.snapshot().lanes, timestamp)
      }
    },
    [onFretChange, onWhammy, publishContacts],
  )

  const resetContacts = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    trackerRef.current.reset()
    whammyTrackerRef.current.reset()
    setActiveLanes([])
    setOpenActive(false)
    onLanesChange([])
    onWhammy(0)
  }, [onLanesChange, onWhammy])

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
    if (lane !== null) {
      whammyTrackerRef.current.press(event.pointerId, event.clientY)
    }
    publishContacts()
    scheduleTap()
  }

  const releaseContact = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    releasePointer(event.pointerId, event.timeStamp)
  }

  const moveContact = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const bounds = lanesRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    const controlsHeight =
      controlsRef.current?.getBoundingClientRect().height ?? window.innerHeight
    const dragDistance = Math.max(
      MIN_WHAMMY_DRAG_PX,
      Math.min(MAX_WHAMMY_DRAG_PX, controlsHeight * 0.12),
    )
    const whammyAmount = whammyTrackerRef.current.move(
      event.pointerId,
      event.clientY,
      dragDistance,
    )

    const progress = Math.max(
      0,
      Math.min(0.999, (event.clientX - bounds.left) / bounds.width),
    )
    const lane = Math.floor(progress * LANE_NAMES.length) as Lane
    const moveType = trackerRef.current.move(event.pointerId, lane)
    if (whammyAmount === null && !moveType) return

    event.preventDefault()
    if (whammyAmount !== null) onWhammy(whammyAmount)
    publishContacts()
    if (moveType === 'held') {
      onFretChange(trackerRef.current.snapshot().lanes, event.timeStamp)
    }
  }

  useEffect(() => {
    const handlePointerEnd = (event: PointerEvent) => {
      releasePointer(event.pointerId, event.timeStamp)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') resetContacts()
    }

    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    window.addEventListener('blur', resetContacts)
    window.addEventListener('pagehide', resetContacts)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      window.removeEventListener('blur', resetContacts)
      window.removeEventListener('pagehide', resetContacts)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [releasePointer, resetContacts])

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
    <div
      ref={controlsRef}
      className={styles.controls}
      data-entering={entering || undefined}
      aria-label="Tap controls"
    >
      <StarPowerRail
        highwayLength={highwayLength}
        active={starPowerActive}
        charge={starPowerMeter}
        onActivate={onStarPower}
      />

      <button
        type="button"
        className={styles.open}
        data-active={openActive || undefined}
        aria-label="Open note"
        onPointerDown={(event) => pressContact(event, null)}
        onPointerUp={releaseContact}
        onPointerCancel={releaseContact}
        onLostPointerCapture={releaseContact}
      />

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
              onPointerUp={releaseContact}
              onPointerCancel={releaseContact}
              onLostPointerCapture={releaseContact}
            >
              <span aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
