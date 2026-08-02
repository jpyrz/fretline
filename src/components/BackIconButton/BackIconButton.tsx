import styles from './BackIconButton.module.scss'

interface BackIconButtonProps {
  label: string
  onClick: () => void
  className?: string
}

export function BackIconButton({
  label,
  onClick,
  className,
}: BackIconButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, className].filter(Boolean).join(' ')}
      data-controller-back
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5-7 7 7 7" />
      </svg>
    </button>
  )
}
