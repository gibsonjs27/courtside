export function curvePath(values: readonly (number | null)[], x: (index: number) => number, y: (value: number) => number) {
  const slopes = values.slice(1).map((value, index) => {
    const previous = values[index]
    const width = x(index + 1) - x(index)
    return value === null || previous === null || width === 0
      ? null : (y(value) - y(previous)) / width
  })
  // Keep the same tangent on either side of a point without overshooting it.
  const tangents = values.map((_, index) => {
    const before = slopes[index - 1]
    const after = slopes[index]
    if (before == null || after == null) return before ?? after ?? 0
    return before * after > 0 ? 2 / (1 / before + 1 / after) : 0
  })

  return values.map((value, index) => {
    if (value === null) return ''
    const previous = values[index - 1]
    const endX = x(index)
    const endY = y(value)
    if (previous == null) return `M ${endX} ${endY}`
    const startX = x(index - 1)
    if (startX === endX) return `L ${endX} ${endY}`
    const third = (endX - startX) / 3
    const controlY1 = y(previous) + tangents[index - 1] * third
    const controlY2 = endY - tangents[index] * third
    return `C ${startX + third} ${controlY1} ${endX - third} ${controlY2} ${endX} ${endY}`
  }).join(' ')
}
