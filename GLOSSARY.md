# Glossary

`which-nuxt` detects Nuxt, Vue, Nuxt module fingerprints, hosting hints, and advisory matches from public site evidence.

## Terms

- **Detector module**: An internal authoring module that anchors one Nuxt module identity (`name`, `packageName`, `collection`, `presetName`). It creates detector presets, JS fingerprints, endpoint probes, and emitted evidence from that identity.
- **Detector preset**: A `ModuleDetectorPreset` value that callers pass as `moduleDetectors`. Presets ship from `which-nuxt/modules`, `which-nuxt/modules/official` and `which-nuxt/modules/community`.
- **Evidence adapter**: A detector function that reads one evidence source, such as HTML, JavaScript, headers, or a public endpoint, and emits detected modules or packages.
- **Certainty**: How sure a module match is: `confirmed`, `inferred` or `possible`. Distinct from **confidence**, the numeric score on a signal or result.
- **Request module**: The internal network interface that owns fetch injection, timeout, abort, and cleanup semantics before callers parse target-site, RDAP, or GitHub responses.
- **Advisory package target**: The normalized package input used by advisory matching, either an exact semver version or an inferred version range.
- **Scanner interface**: A focused detection interface such as `scanHtml`, `scanJs`, `scanHeaders`, or `probeNuxtEndpoints`. Scanner-specific tests should prefer these over the public `detectNuxt` orchestration interface.

## Map

| Term | Export path | Stability | Consumers | Customer word |
| --- | --- | --- | --- | --- |
| Detector module | `src/modules/define.ts` | internal | module presets | "module mapping" |
| Detector preset | `which-nuxt/modules*` | published subpath | `detectNuxt`, scanners | "preset" |
| Scanner interface | `which-nuxt/scanners` | published subpath (`scanHtml`, `scanJs`) | crawlers | "scanner" |
| Certainty | `DetectedModule['certainty']` | published type | CLI, JSON output | "certainty" |
| Advisory package target | `src/advisories/match.ts` | internal | `checkAdvisories` | "detected version" or "inferred range" |
