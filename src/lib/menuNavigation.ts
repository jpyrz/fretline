export function nextMenuIndex(
  itemCount: number,
  activeIndex: number,
  defaultIndex: number,
  direction: -1 | 1,
): number {
  if (itemCount <= 0) return -1

  const baseIndex =
    activeIndex >= 0
      ? activeIndex
      : defaultIndex >= 0
        ? defaultIndex
        : direction === 1
          ? -1
          : 0

  return (baseIndex + direction + itemCount) % itemCount
}
