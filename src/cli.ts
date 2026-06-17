import { defineCommand } from 'citty'
import { consola } from 'consola'
import { checkAdvisories } from './advisories/check.ts'
import { detectNuxt } from './detect/index.ts'

export const main = defineCommand({
  meta: {
    name: 'whichnuxt',
    description: 'Detect Nuxt versions and known advisories for a public site.',
  },
  args: {
    target: {
      type: 'positional',
      description: 'URL or HTML to scan.',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Print JSON output.',
      default: false,
    },
    advisories: {
      type: 'boolean',
      description: 'Check advisories for exact detected package versions.',
      default: true,
    },
    js: {
      type: 'boolean',
      description: 'Fetch and scan Nuxt JavaScript chunks.',
      default: true,
    },
    endpoints: {
      type: 'boolean',
      description: 'Probe Nuxt endpoints.',
      default: true,
    },
    age: {
      type: 'boolean',
      description: 'Fetch RDAP domain age metadata.',
      default: false,
    },
  },
  async run({ args }) {
    const detected = await detectNuxt(args.target, {
      scanJs: args.js,
      probeEndpoints: args.endpoints,
      domainAge: args.age,
    })
    const advisories = args.advisories ? await checkAdvisories(detected) : null

    if (args.json) {
      consola.log(JSON.stringify({ detected, advisories }, null, 2))
      return
    }

    consola.box(detected.isNuxt ? 'Nuxt detected' : 'Nuxt not detected')
    consola.info(`Confidence: ${detected.confidence}`)

    if (detected.title)
      consola.info(`Title: ${detected.title}`)

    consola.info(`Rendering: ${detected.rendering.mode} (confidence ${detected.rendering.confidence})`)

    for (const pkg of detected.packages) {
      const version = pkg.version || 'unknown'
      consola.info(`${pkg.name}: ${version} (${pkg.source}, confidence ${pkg.confidence})`)
    }

    if (detected.hosting) {
      const provider = detected.hosting.provider || 'unknown'
      consola.info(`Hosting: ${provider} (confidence ${detected.hosting.confidence})`)
      if (detected.hosting.domainAge?.createdAt)
        consola.info(`Domain: ${detected.hosting.domainAge.domain}, created ${detected.hosting.domainAge.createdAt}`)
    }

    if (advisories) {
      if (advisories.matches.length === 0) {
        consola.success('No advisories matched exact detected package versions.')
      }
      else {
        consola.warn(`${advisories.matches.length} advisory match(es):`)
        for (const match of advisories.matches)
          consola.warn(`${match.packageName}@${match.version}: ${match.severity} ${match.ghsaId} - ${match.summary}`)
      }
    }

    if (detected.errors.length > 0) {
      consola.warn('Some scan steps failed:')
      for (const error of detected.errors)
        consola.warn(error)
    }
  },
})
