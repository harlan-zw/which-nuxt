import type { DetectedModule, ModuleDetectorPreset } from '../types.ts'
import { createDetectionEvidence } from './signals.ts'

function header(headers: Record<string, string>, name: string) {
  return headers[name.toLowerCase()]
}

export interface HeaderScanOptions {
  moduleDetectors?: readonly ModuleDetectorPreset[]
}

export function scanHeaders(headers: Record<string, string>, options: HeaderScanOptions = {}): { modules: DetectedModule[] } {
  const evidence = createDetectionEvidence()

  for (const detectorPreset of options.moduleDetectors || []) {
    for (const detector of detectorPreset.headerDetectors || []) {
      detector({
        headers,
        getHeader: name => header(headers, name),
        emitModule: evidence.emitModule,
      })
    }
  }

  return { modules: evidence.modules }
}
