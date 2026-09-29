import type { AdvisoryMatch, DetectedModule, DetectedPackage } from './types.ts'
import process from 'node:process'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { checkAdvisories } from './advisories/check.ts'
import { detectNuxt } from './detect/index.ts'

const POSITIVE_INTEGER_RE = /^\d+$/

function parsePositiveInteger(value: string | undefined, fallback: number, label: string) {
  if (!value)
    return fallback

  if (!POSITIVE_INTEGER_RE.test(value))
    throw new Error(`${label} must be a positive integer.`)

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer.`)

  return parsed
}

function stringArg(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function versionLabel(item: { version: string | null, versionRange?: string | null }) {
  if (item.version)
    return item.version

  if (item.versionRange)
    return item.versionRange

  return 'unknown'
}

function packageDetails(pkg: DetectedPackage) {
  const details = [pkg.source, `confidence ${pkg.confidence}`]
  if (pkg.certainty)
    details.unshift(pkg.certainty)
  return details.join(', ')
}

function moduleDetails(module: DetectedModule) {
  return [
    module.certainty,
    module.source,
    module.confidence ? `confidence ${module.confidence}` : null,
  ].filter(Boolean).join(', ')
}

function advisoryTarget(match: AdvisoryMatch) {
  if (match.version)
    return `${match.packageName}@${match.version}`

  return `${match.packageName}@${match.versionRange}`
}

export const main = defineCommand({
  meta: {
    name: 'which-nuxt',
    description: 'Detect Nuxt versions and known advisories for a public site.',
  },
  args: {
    'target': {
      type: 'positional',
      description: 'URL or HTML to scan.',
      required: true,
    },
    'json': {
      type: 'boolean',
      description: 'Print JSON output.',
      default: false,
    },
    'hosting': {
      type: 'boolean',
      description: 'Detect hosting provider from response headers.',
      default: true,
    },
    'advisories': {
      type: 'boolean',
      description: 'Check advisories for exact detected package versions.',
      default: true,
    },
    'js': {
      type: 'boolean',
      description: 'Fetch and scan Nuxt JavaScript chunks.',
      default: true,
    },
    'endpoints': {
      type: 'boolean',
      description: 'Probe Nuxt endpoints.',
      default: true,
    },
    'age': {
      type: 'boolean',
      description: 'Fetch RDAP domain age metadata.',
      default: false,
    },
    'timeout': {
      type: 'string',
      description: 'Network timeout in milliseconds.',
      valueHint: 'ms',
      default: '8000',
    },
    'max-js-requests': {
      type: 'string',
      description: 'Maximum Nuxt JavaScript chunks to fetch.',
      valueHint: 'count',
      default: '2',
    },
    'github-token': {
      type: 'string',
      description: 'GitHub token for advisory API requests. Defaults to GITHUB_TOKEN.',
      valueHint: 'token',
    },
    'user-agent': {
      type: 'string',
      description: 'Custom User-Agent for target-site requests.',
      valueHint: 'agent',
    },
  },
  async run({ args }) {
    const timeout = parsePositiveInteger(stringArg(args.timeout), 8000, '--timeout')
    const maxJsRequests = parsePositiveInteger(stringArg(args.maxJsRequests), 4, '--max-js-requests')
    const githubToken = stringArg(args.githubToken) || process.env.GITHUB_TOKEN

    const detected = await detectNuxt(args.target, {
      scanJs: args.js,
      probeEndpoints: args.endpoints,
      hosting: args.hosting,
      domainAge: args.age,
      timeout,
      maxJsRequests,
      userAgent: stringArg(args.userAgent),
    })
    const advisories = args.advisories
      ? await checkAdvisories(detected, {
          token: githubToken,
          timeout,
        })
      : null

    if (args.json) {
      process.stdout.write(`${JSON.stringify({ detected, advisories }, null, 2)}\n`)
      return
    }

    consola.box(detected.isNuxt ? 'Nuxt detected' : 'Nuxt not detected')
    consola.info(`Confidence: ${detected.confidence}`)

    if (detected.finalUrl)
      consola.info(`URL: ${detected.finalUrl}`)

    if (detected.title)
      consola.info(`Title: ${detected.title}`)

    consola.info(`Rendering: ${detected.rendering.mode} (confidence ${detected.rendering.confidence})`)

    if (detected.packages.length > 0) {
      consola.start('Packages')
      for (const pkg of detected.packages)
        consola.info(`${pkg.name}: ${versionLabel(pkg)} (${packageDetails(pkg)})`)
    }

    if (detected.modules.length > 0) {
      consola.start('Modules')
      for (const module of detected.modules)
        consola.info(`${module.name} (${module.packageName}): ${versionLabel(module)} (${moduleDetails(module)})`)
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
        for (const match of advisories.matches) {
          const patched = match.firstPatchedVersion ? `, patched in ${match.firstPatchedVersion}` : ''
          consola.warn(`${advisoryTarget(match)}: ${match.severity} ${match.ghsaId}${patched} - ${match.summary}`)
        }
      }

      if (advisories.errors.length > 0) {
        consola.warn('Some advisory checks failed:')
        for (const error of advisories.errors)
          consola.warn(error)
      }
    }

    if (detected.errors.length > 0) {
      consola.warn('Some scan steps failed:')
      for (const error of detected.errors)
        consola.warn(error)
    }
  },
})
