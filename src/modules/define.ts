import type {
  DetectedModule,
  DetectedPackage,
  ModuleDetectorPreset,
  ModuleEndpointProbe,
  ModuleJsFingerprint,
  NuxtModuleDefinition,
} from '../types.ts'

export interface DetectorModuleDefinition extends NuxtModuleDefinition {
  presetName: string
}

type DetectorPresetImplementation = Omit<ModuleDetectorPreset, 'name' | 'collection' | 'modules'>

type ModuleEvidence = Pick<DetectedModule, 'certainty' | 'source' | 'signals'> & {
  version?: string | null
  versionRange?: string | null
  confidence?: number
}

type PackageEvidence = Pick<DetectedPackage, 'version' | 'confidence' | 'source' | 'signals'> & {
  versionRange?: string | null
  certainty?: DetectedPackage['certainty']
}

export function defineDetectorModule(module: DetectorModuleDefinition): DetectorModuleDefinition {
  return module
}

function moduleDefinition(module: DetectorModuleDefinition): NuxtModuleDefinition {
  return {
    name: module.name,
    packageName: module.packageName,
    collection: module.collection,
  }
}

export function defineModuleDetector(
  module: DetectorModuleDefinition,
  implementation: DetectorPresetImplementation = {},
): ModuleDetectorPreset {
  return {
    name: module.presetName,
    collection: module.collection,
    modules: [moduleDefinition(module)],
    ...implementation,
  }
}

export function detectedModule(
  module: DetectorModuleDefinition,
  evidence: ModuleEvidence,
): DetectedModule {
  return {
    name: module.name,
    packageName: module.packageName,
    version: evidence.version ?? null,
    versionRange: evidence.versionRange,
    certainty: evidence.certainty,
    confidence: evidence.confidence,
    source: evidence.source,
    signals: evidence.signals,
  }
}

export function detectedPackage(
  module: DetectorModuleDefinition,
  evidence: PackageEvidence,
): DetectedPackage {
  return {
    name: module.packageName,
    version: evidence.version,
    versionRange: evidence.versionRange,
    certainty: evidence.certainty,
    confidence: evidence.confidence,
    source: evidence.source,
    signals: evidence.signals,
  }
}

export function moduleJsFingerprint(
  module: DetectorModuleDefinition,
  fingerprint: Omit<ModuleJsFingerprint, keyof NuxtModuleDefinition>,
): ModuleJsFingerprint {
  return {
    ...moduleDefinition(module),
    ...fingerprint,
  }
}

export function debugVersionProbe(
  module: DetectorModuleDefinition,
  path: string,
  signal: string,
): ModuleEndpointProbe {
  return {
    path,
    base: 'origin',
    detect: ({ isJsonLikeResponse, moduleVersion, emitModule, emitPackage }) => {
      if (!isJsonLikeResponse())
        return

      const version = moduleVersion()
      emitModule(detectedModule(module, {
        version,
        certainty: version ? 'confirmed' : 'inferred',
        confidence: version ? 10 : 7,
        source: 'endpoint',
        signals: [signal],
      }))
      if (version) {
        emitPackage(detectedPackage(module, {
          version,
          confidence: 10,
          source: 'endpoint',
          signals: [signal],
        }))
      }
    },
  }
}
