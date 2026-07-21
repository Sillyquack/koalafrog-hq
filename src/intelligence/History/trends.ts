import type { HistoryPoint } from '../Shared/models'

const ordered = (series: readonly HistoryPoint[]) => [...series].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
export const timeSeries = (points: readonly HistoryPoint[]) => ordered(points)
export function changeDetection(points: readonly HistoryPoint[], threshold = 0) {
  const values = ordered(points), changes: Array<{ from: HistoryPoint; to: HistoryPoint; change: number }> = []
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index].value - values[index - 1].value
    if (Math.abs(change) > threshold) changes.push({ from: values[index - 1], to: values[index], change })
  }
  return changes
}
export function growthEstimation(points: readonly HistoryPoint[]) {
  const values = ordered(points)
  if (values.length < 2) return null
  const elapsedDays = (Date.parse(values.at(-1)!.timestamp) - Date.parse(values[0].timestamp)) / 86_400_000
  return elapsedDays > 0 ? (values.at(-1)!.value - values[0].value) / elapsedDays : null
}
export function comparison(current: number, previous: number) { return { absolute: current - previous, percent: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100 } }
export function personalBaseline(points: readonly HistoryPoint[]) { return points.length ? points.reduce((total, point) => total + point.value, 0) / points.length : null }
