import type {
  VisualAsset,
  VisualAssetKind,
} from '../types/game'

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createLocalVisualAssets(
  files: File[],
  kind: VisualAssetKind,
): VisualAsset[] {
  return files
    .filter(
      (file) =>
        file.type.startsWith('image/') || IMAGE_FILE.test(file.name),
    )
    .map((file) => {
      const relativePath =
        (file as File & { webkitRelativePath?: string })
          .webkitRelativePath || file.name
      return {
        id: `local:${kind}:${stableHash(
          `${relativePath}:${file.size}:${file.lastModified}`,
        ).toString(36)}`,
        kind,
        name: file.name,
        file,
        source: { type: 'local' },
      }
    })
}

export function selectVisualAsset(
  assets: VisualAsset[],
  kind: VisualAssetKind,
  selection: string,
  seed: string,
): VisualAsset | null {
  const choices = assets.filter((asset) => asset.kind === kind)
  if (selection === 'default' || choices.length === 0) return null
  if (selection === 'random') {
    return choices[stableHash(`${kind}:${seed}`) % choices.length] ?? null
  }
  return choices.find((asset) => asset.id === selection) ?? null
}
