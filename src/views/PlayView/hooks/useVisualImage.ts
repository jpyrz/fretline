import { useEffect, useState } from 'react'

export function useVisualImage(
  file: File | undefined,
): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!file) {
      setImage(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    const nextImage = new Image()
    let active = true
    setImage(null)
    nextImage.onload = () => {
      if (active) setImage(nextImage)
    }
    nextImage.onerror = () => {
      if (active) setImage(null)
    }
    nextImage.src = objectUrl
    return () => {
      active = false
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return image
}
