import { communityNuxtModuleDetectors } from './community.ts'
import { officialNuxtModuleDetectors } from './official.ts'

export type {
  ModuleDetectorCollection,
  ModuleDetectorPreset,
  ModuleEndpointProbe,
  ModuleEndpointProbeContext,
  ModuleHeaderDetector,
  ModuleHeaderDetectorContext,
  ModuleHtmlDetector,
  ModuleHtmlDetectorContext,
  ModuleHtmlResource,
  ModuleInferContext,
  ModuleInferDetector,
  ModuleJsFingerprint,
  NuxtModuleDefinition,
} from '../types.ts'
export {
  communityNuxtModuleDetectors,
  nuxtAiReadyModuleDetector,
  nuxtColorModeModuleDetector,
  nuxtI18nModuleDetector,
  nuxtLinkCheckerModuleDetector,
  nuxtOgImageModuleDetector,
  nuxtRobotsModuleDetector,
  nuxtSchemaOrgModuleDetector,
  nuxtSecurityModuleDetector,
  nuxtSeoModuleDetector,
  nuxtSeoUtilsModuleDetector,
  nuxtSiteConfigModuleDetector,
  nuxtSitemapModuleDetector,
  piniaNuxtModuleDetector,
  vuetifyNuxtModuleDetector,
} from './community.ts'
export {
  nuxtContentModuleDetector,
  nuxtFontsModuleDetector,
  nuxtIconModuleDetector,
  nuxtImageModuleDetector,
  nuxtScriptsModuleDetector,
  nuxtUiModuleDetector,
  officialNuxtModuleDetectors,
} from './official.ts'

export const nuxtModuleDetectors = [
  ...officialNuxtModuleDetectors,
  ...communityNuxtModuleDetectors,
] as const
