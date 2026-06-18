# Context

`which-nuxt` detects Nuxt, Vue, Nuxt module fingerprints, hosting hints, and advisory matches from public site evidence.

## Domain Terms

- **Detector module**: An internal authoring module that anchors one Nuxt module identity (`name`, `packageName`, `collection`, `presetName`) and creates detector presets, JS fingerprints, endpoint probes, and emitted evidence from that identity.
- **Evidence adapter**: A detector function that reads one evidence source, such as HTML, JavaScript, headers, or a public endpoint, and emits detected modules or packages.
- **Request module**: The internal network interface that owns fetch injection, timeout, abort, and cleanup semantics before callers parse target-site, RDAP, or GitHub responses.
- **Advisory package target**: The normalized package input used by advisory matching, either an exact semver version or an inferred version range.
- **Scanner interface**: A focused detection interface such as `scanHtml`, `scanJs`, `scanHeaders`, or `probeNuxtEndpoints`; scanner-specific tests should prefer these over the public `detectNuxt` orchestration interface.
