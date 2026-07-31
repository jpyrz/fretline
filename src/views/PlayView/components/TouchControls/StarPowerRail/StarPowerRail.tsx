import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  TAP_HIT_LINE_RATIO,
  highwayPoint,
  trackEdge,
} from '../../../../../game/rendering/highwayGeometry'
import {
  gestureDistance,
  isPowerSwipe,
  type DirectionVector,
  type GesturePoint,
} from './starPowerGesture'
import styles from './StarPowerRail.module.scss'

const RAIL_TOP_PROGRESS = 0.63
const RAIL_BOTTOM_PROGRESS = 0.92
const RAIL_OUTWARD_OFFSET = 30
const SWIPE_THRESHOLD_PX = 42
const TAP_MOVEMENT_LIMIT_PX = 12

interface RailPlacement {
  left: number
  top: number
  height: number
  angle: number
  upwardDirection: DirectionVector
}

interface ActiveGesture {
  pointerId: number
  start: GesturePoint
  activated: boolean
}

interface StarPowerRailProps {
  highwayLength: number
  active: boolean
  charge: number
  onActivate: (timestamp: number) => void
}

type RailStyle = CSSProperties & {
  '--power-charge': number
}

function calculatePlacement(
  width: number,
  height: number,
  highwayLength: number,
): RailPlacement {
  const top = highwayPoint(
    width,
    height,
    RAIL_TOP_PROGRESS,
    highwayLength,
    TAP_HIT_LINE_RATIO,
  )
  const bottom = highwayPoint(
    width,
    height,
    RAIL_BOTTOM_PROGRESS,
    highwayLength,
    TAP_HIT_LINE_RATIO,
  )
  const topX = trackEdge(top, -1)
  const bottomX = trackEdge(bottom, -1)
  const deltaX = bottomX - topX
  const deltaY = bottom.y - top.y
  const length = Math.max(1, Math.hypot(deltaX, deltaY))
  const downDirection = {
    x: deltaX / length,
    y: deltaY / length,
  }
  const outwardDirection = {
    x: -downDirection.y,
    y: downDirection.x,
  }

  return {
    left:
      (topX + bottomX) / 2 +
      outwardDirection.x * RAIL_OUTWARD_OFFSET,
    top:
      (top.y + bottom.y) / 2 +
      outwardDirection.y * RAIL_OUTWARD_OFFSET,
    height: length,
    angle:
      (Math.atan2(deltaY, deltaX) * 180) / Math.PI - 90,
    upwardDirection: {
      x: -downDirection.x,
      y: -downDirection.y,
    },
  }
}

export function StarPowerRail({
  highwayLength,
  active,
  charge,
  onActivate,
}: StarPowerRailProps) {
  const railRef = useRef<HTMLButtonElement>(null)
  const gestureRef = useRef<ActiveGesture | null>(null)
  const [placement, setPlacement] = useState<RailPlacement | null>(
    null,
  )
  const boundedCharge = Math.max(0, Math.min(1, charge))
  const ready = !active && boundedCharge >= 0.5

  useLayoutEffect(() => {
    const rail = railRef.current
    const container = rail?.parentElement
    if (!container) return

    const positionRail = () => {
      const bounds = container.getBoundingClientRect()
      setPlacement(
        calculatePlacement(
          bounds.width,
          bounds.height,
          highwayLength,
        ),
      )
    }

    positionRail()
    const observer = new ResizeObserver(positionRail)
    observer.observe(container)
    return () => observer.disconnect()
  }, [highwayLength])

  const activate = (timestamp: number) => {
    if (!ready) return
    onActivate(timestamp)
  }

  const clearGesture = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (
      ready &&
      !gesture.activated &&
      gestureDistance(gesture.start, {
        x: event.clientX,
        y: event.clientY,
      }) <= TAP_MOVEMENT_LIMIT_PX
    ) {
      activate(event.timeStamp)
    }
    gestureRef.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activate(event.timeStamp)
  }

  return (
    <button
      ref={railRef}
      type="button"
      className={styles.rail}
      data-active={active || undefined}
      data-ready={ready || undefined}
      aria-label={`Star Power ${Math.round(boundedCharge * 100)} percent charged. ${ready ? 'Swipe up or tap to activate.' : active ? 'Star Power is active.' : 'Charge the meter to activate.'}`}
      aria-pressed={active}
      style={
        placement
          ? ({
              '--power-charge': boundedCharge,
              left: placement.left,
              top: placement.top,
              height: placement.height,
              transform: `translate(-50%, -50%) rotate(${placement.angle}deg)`,
            } as RailStyle)
          : ({ '--power-charge': boundedCharge } as RailStyle)
      }
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        gestureRef.current = {
          pointerId: event.pointerId,
          start: { x: event.clientX, y: event.clientY },
          activated: false,
        }
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current
        if (
          !ready ||
          !placement ||
          !gesture ||
          gesture.pointerId !== event.pointerId ||
          gesture.activated
        ) {
          return
        }

        if (
          isPowerSwipe(
            gesture.start,
            { x: event.clientX, y: event.clientY },
            placement.upwardDirection,
            SWIPE_THRESHOLD_PX,
          )
        ) {
          gesture.activated = true
          activate(event.timeStamp)
        }
      }}
      onPointerUp={clearGesture}
      onPointerCancel={() => {
        gestureRef.current = null
      }}
      onLostPointerCapture={() => {
        gestureRef.current = null
      }}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.swipeCue} aria-hidden="true">
        ↑
      </span>
      <span className={styles.track} aria-hidden="true">
        <i className={styles.fill} />
        <i className={styles.readyLine} />
      </span>
      <span className={styles.ignition} aria-hidden="true">
        <i>★</i>
      </span>
    </button>
  )
}
