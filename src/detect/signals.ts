import type { DetectedModule, DetectedPackage, DetectionSignal, DetectionSource } from '../types.ts'

export const NUXT_CONFIDENCE_THRESHOLD = 5

export function addSignal(
  signals: DetectionSignal[],
  name: string,
  weight: number,
  source: DetectionSource,
  description?: string,
) {
  if (signals.some(signal => signal.name === name))
    return

  signals.push({ name, weight, source, description })
}

export function mergeSignals(...groups: DetectionSignal[][]): DetectionSignal[] {
  const merged: DetectionSignal[] = []
  for (const group of groups) {
    for (const signal of group)
      addSignal(merged, signal.name, signal.weight, signal.source, signal.description)
  }
  return merged
}

export function signalConfidence(signals: DetectionSignal[]) {
  return signals.reduce((total, signal) => total + signal.weight, 0)
}

export function upsertPackage(
  packages: DetectedPackage[],
  candidate: DetectedPackage,
) {
  const existing = packages.find(pkg => pkg.name === candidate.name)
  if (!existing) {
    packages.push(candidate)
    return
  }

  if (!existing.version && candidate.version)
    existing.version = candidate.version

  if (!existing.versionRange && candidate.versionRange)
    existing.versionRange = candidate.versionRange

  if (candidate.certainty === 'confirmed' || !existing.certainty)
    existing.certainty = candidate.certainty

  existing.confidence = Math.max(existing.confidence, candidate.confidence)
  existing.signals = Array.from(new Set([...existing.signals, ...candidate.signals]))

  if (candidate.version && candidate.confidence >= existing.confidence)
    existing.source = candidate.source
}

const CERTAINTY_SCORE = {
  possible: 1,
  inferred: 2,
  confirmed: 3,
}

export function upsertModule(
  modules: DetectedModule[],
  candidate: DetectedModule,
) {
  const existing = modules.find(module => module.packageName === candidate.packageName)
  if (!existing) {
    modules.push(candidate)
    return
  }

  if (!existing.version && candidate.version)
    existing.version = candidate.version

  if (!existing.versionRange && candidate.versionRange)
    existing.versionRange = candidate.versionRange

  if (CERTAINTY_SCORE[candidate.certainty] > CERTAINTY_SCORE[existing.certainty])
    existing.certainty = candidate.certainty

  existing.confidence = Math.max(existing.confidence || 0, candidate.confidence || 0)
  existing.signals = Array.from(new Set([...existing.signals, ...candidate.signals]))

  if (candidate.version || CERTAINTY_SCORE[candidate.certainty] >= CERTAINTY_SCORE[existing.certainty])
    existing.source = candidate.source
}
