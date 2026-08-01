export interface SpriteAtlas {
  src: string
  columns: number
  rows: number
  frameCount: number
  anchorY: number
}

export interface SpriteDestination {
  centerX: number
  anchorY: number
  width: number
  height: number
}

export const HIT_FIRE_ATLAS: SpriteAtlas = {
  src: '/assets/vfx/hit-fire-spritesheet.png',
  columns: 4,
  rows: 2,
  frameCount: 8,
  anchorY: 230 / 256,
}

export const STAR_POWER_LIGHTNING_ATLAS: SpriteAtlas = {
  src: '/assets/vfx/star-power-lightning-spritesheet.png',
  columns: 3,
  rows: 2,
  frameCount: 6,
  anchorY: 372 / 384,
}

const spriteImages = new Map<string, HTMLImageElement>()

function loadSprite(atlas: SpriteAtlas): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  let image = spriteImages.get(atlas.src)
  if (!image) {
    image = new Image()
    image.decoding = 'async'
    image.src = atlas.src
    spriteImages.set(atlas.src, image)
  }
  return image.complete && image.naturalWidth > 0 ? image : null
}

export function preloadGameplayVfx(): void {
  loadSprite(HIT_FIRE_ATLAS)
  loadSprite(STAR_POWER_LIGHTNING_ATLAS)
}

export function gameplayVfxImage(
  atlas: SpriteAtlas,
): HTMLImageElement | null {
  return loadSprite(atlas)
}

export function spriteFrameIndex(
  progress: number,
  frameCount: number,
): number {
  if (frameCount <= 1) return 0
  const normalized = Math.max(0, Math.min(0.999_999, progress))
  return Math.floor(normalized * frameCount)
}

export function spriteFrameCell(
  frameIndex: number,
  atlas: Pick<SpriteAtlas, 'columns' | 'rows' | 'frameCount'>,
): { column: number; row: number } {
  const safeIndex = Math.max(
    0,
    Math.min(atlas.frameCount - 1, Math.floor(frameIndex)),
  )
  return {
    column: safeIndex % atlas.columns,
    row: Math.min(atlas.rows - 1, Math.floor(safeIndex / atlas.columns)),
  }
}

export function drawSpriteFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  atlas: SpriteAtlas,
  progress: number,
  destination: SpriteDestination,
): void {
  const frameIndex = spriteFrameIndex(progress, atlas.frameCount)
  const { column, row } = spriteFrameCell(frameIndex, atlas)
  const sourceWidth = image.naturalWidth / atlas.columns
  const sourceHeight = image.naturalHeight / atlas.rows
  const destinationX = destination.centerX - destination.width / 2
  const destinationY =
    destination.anchorY - destination.height * atlas.anchorY

  context.drawImage(
    image,
    column * sourceWidth,
    row * sourceHeight,
    sourceWidth,
    sourceHeight,
    destinationX,
    destinationY,
    destination.width,
    destination.height,
  )
}
