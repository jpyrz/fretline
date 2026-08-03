import { useEffect, useRef, useState } from 'react'
import { useProfiles } from '../../ProfileProvider'
import styles from './ProfilePicker.module.scss'

function playerNumber(profileCount: number): string {
  return `Player ${profileCount + 1}`
}

export function ProfilePicker() {
  const {
    profiles,
    profilesReady,
    profileError,
    preferredProfileId,
    pickerOpen,
    closeProfilePicker,
    selectProfile,
    selectGuest,
    createProfile,
  } = useProfiles()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pickerOpen) {
      setCreating(false)
      setSaving(false)
      return
    }
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-profile-picker-default]')
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pickerOpen])

  useEffect(() => {
    if (!creating) return
    const defaultName = playerNumber(profiles.length)
    setName(defaultName)
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [creating, profiles.length])

  if (!pickerOpen) return null

  const submit = async () => {
    if (saving || !name.trim()) return
    setSaving(true)
    try {
      await createProfile(name)
    } catch {
      // ProfileProvider exposes the persistent storage error in this dialog.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-picker-title"
      >
        <header>
          <p>Player check-in</p>
          <h1 id="profile-picker-title">
            {creating ? 'Create profile' : 'Choose your profile'}
          </h1>
          <span>
            {creating
              ? 'Profiles live only in this browser.'
              : 'Scores, FCs, and achievements follow the selected player.'}
          </span>
        </header>

        {creating ? (
          <form
            className={styles.createForm}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label>
              <span>Profile name</span>
              <input
                ref={inputRef}
                value={name}
                maxLength={24}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div>
              <button
                type="submit"
                data-controller-nav-item
                disabled={!name.trim() || saving}
              >
                {saving ? 'Saving…' : 'Create & join'}
              </button>
              <button
                type="button"
                data-controller-back
                data-controller-nav-item
                onClick={() => setCreating(false)}
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.profileList}>
            {!profilesReady && <p className={styles.status}>Loading players…</p>}
            {profiles.map((profile, index) => (
              <button
                type="button"
                key={profile.id}
                data-controller-nav-item
                data-controller-default={
                  profile.id === preferredProfileId ||
                  (!preferredProfileId && index === 0) ||
                  undefined
                }
                data-profile-picker-default={
                  profile.id === preferredProfileId ||
                  (!preferredProfileId && index === 0) ||
                  undefined
                }
                onClick={() => selectProfile(profile.id)}
              >
                <i aria-hidden="true">{profile.name.charAt(0).toUpperCase()}</i>
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.lifetimeStats.songsPlayed} songs ·{' '}
                    {profile.lifetimeStats.fullCombos} FCs ·{' '}
                    {profile.achievements.length} achievements
                  </small>
                </span>
                <b aria-hidden="true">›</b>
              </button>
            ))}
            <button
              type="button"
              data-controller-nav-item
              data-controller-default={profiles.length === 0 || undefined}
              data-profile-picker-default={profiles.length === 0 || undefined}
              onClick={selectGuest}
            >
              <i aria-hidden="true">G</i>
              <span>
                <strong>Guest</strong>
                <small>Play without saving records or achievements</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
            <button
              type="button"
              className={styles.createButton}
              data-controller-nav-item
              onClick={() => setCreating(true)}
            >
              <i aria-hidden="true">+</i>
              <span>
                <strong>Create new profile</strong>
                <small>Start a new local player record</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          </div>
        )}

        {profileError && <p className={styles.error}>{profileError}</p>}
        {!creating && (
          <button
            type="button"
            className={styles.closeButton}
            data-controller-back
            onClick={closeProfilePicker}
          >
            Cancel
          </button>
        )}
      </section>
    </div>
  )
}
