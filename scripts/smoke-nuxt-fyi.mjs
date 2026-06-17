#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { checkAdvisories, detectNuxt } from '../dist/index.mjs'

const page = Number(process.argv[2] || 1)
const response = await fetch(`https://nuxt.fyi/api/hits?page=${page}`)
if (!response.ok)
  throw new Error(`Failed to fetch nuxt.fyi hits: ${response.status}`)

const payload = await response.json()
const rows = []

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
}

function formatNuxt(row) {
  if (!row.ok)
    return 'no'
  return row.version ? 'confirmed' : 'detected'
}

function formatVersion(row) {
  if (row.version)
    return row.version
  const nuxt = row.packages.find(pkg => pkg.name === 'nuxt')
  if (nuxt?.versionRange)
    return `${nuxt.versionRange} inferred`
  return ''
}

function formatOtherDependencies(packages) {
  return packages
    .filter(pkg => pkg.name !== 'nuxt' && pkg.version)
    .map(pkg => `${pkg.name}@${pkg.version}`)
    .sort()
    .join(', ')
}

function formatModules(modules) {
  return modules
    .map((module) => {
      const version = module.version || module.versionRange
      const suffix = version ? `@${version}` : ''
      return `${module.packageName}${suffix}${module.certainty === 'possible' ? ' possible' : module.certainty === 'inferred' ? ' inferred' : ''}`
    })
    .sort()
    .join(', ')
}

function formatAdvisories(row) {
  if (!row.advisories?.matches?.length)
    return ''

  return row.advisories.matches
    .map(match => `${match.matchType}:${match.severity}:${match.ghsaId}`)
    .join(', ')
}

function formatDomainAge(domainAge) {
  if (!domainAge?.ageDays)
    return ''
  const years = domainAge.ageDays / 365.25
  return years >= 1 ? `${years.toFixed(1)}y` : `${domainAge.ageDays}d`
}

function formatNotes(row) {
  const notes = []
  if (row.expectedVersion && row.version !== row.expectedVersion)
    notes.push(`Nuxt.fyi reports ${row.expectedVersion}`)
  if (row.errors.length)
    notes.push(row.errors.join('; '))
  return notes.join('; ')
}

function toMarkdown(report) {
  const lines = [
    `# Nuxt.fyi Page ${report.summary.page} Smoke Report`,
    '',
    `- Total: ${report.summary.total}`,
    `- Detected: ${report.summary.detected}`,
    `- Missed: ${report.summary.missed}`,
    `- Version matches: ${report.summary.versionMatches}`,
    `- Rendering: ${Object.entries(report.summary.rendering).map(([mode, count]) => `${mode} ${count}`).join(', ')}`,
    '',
    `- Advisory matches: exact ${report.summary.advisories.exact}, possible ${report.summary.advisories.possible}`,
    '',
    '| Domain | Nuxt | Version | Rendering | Edge/Host | Registrar | Domain Age | Modules | Other Dependencies | Advisories | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ]

  for (const row of report.rows) {
    lines.push(`| ${[
      row.domain,
      formatNuxt(row),
      formatVersion(row),
      row.rendering,
      row.edgeProvider || '',
      row.registrar || '',
      formatDomainAge(row.domainAge),
      formatModules(row.modules),
      formatOtherDependencies(row.packages),
      formatAdvisories(row),
      formatNotes(row),
    ].map(escapeCell).join(' | ')} |`)
  }

  return `${lines.join('\n')}\n`
}

for (const hit of payload.hits) {
  const target = hit.finalUrl || `https://${hit.domain}/`
  const startedAt = Date.now()
  try {
    const detected = await detectNuxt(target, {
      timeout: 10_000,
      maxJsRequests: 4,
      maxJsBytes: 200_000,
      domainAge: true,
    })
    const advisories = await checkAdvisories(detected, {
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    })
    rows.push({
      domain: hit.domain,
      target,
      expectedVersion: hit.version,
      nuxtFyiConfidence: hit.confidence,
      ok: detected.isNuxt,
      confidence: detected.confidence,
      packages: detected.packages,
      modules: detected.modules,
      version: detected.packages.find(pkg => pkg.name === 'nuxt')?.version || null,
      rendering: detected.rendering.mode,
      renderingConfidence: detected.rendering.confidence,
      edgeProvider: detected.hosting?.provider || null,
      registrar: detected.hosting?.domainAge?.registrar || null,
      domainAge: detected.hosting?.domainAge || null,
      finalUrl: detected.finalUrl,
      advisories,
      errors: detected.errors,
      elapsedMs: Date.now() - startedAt,
    })
  }
  catch (error) {
    rows.push({
      domain: hit.domain,
      target,
      expectedVersion: hit.version,
      nuxtFyiConfidence: hit.confidence,
      ok: false,
      confidence: 0,
      packages: [],
      modules: [],
      version: null,
      rendering: 'unknown',
      renderingConfidence: 0,
      edgeProvider: null,
      registrar: null,
      domainAge: null,
      finalUrl: null,
      advisories: {
        matches: [],
        packages: [],
        source: 'github',
        updatedAt: null,
        incomplete: false,
        errors: [],
      },
      errors: [(error).message],
      elapsedMs: Date.now() - startedAt,
    })
  }
}

const summary = {
  page,
  total: rows.length,
  detected: rows.filter(row => row.ok).length,
  missed: rows.filter(row => !row.ok).length,
  versionMatches: rows.filter(row => row.expectedVersion && row.version === row.expectedVersion).length,
  rendering: rows.reduce((acc, row) => {
    acc[row.rendering] = (acc[row.rendering] || 0) + 1
    return acc
  }, {}),
  advisories: {
    exact: rows.reduce((total, row) => total + row.advisories.matches.filter(match => match.matchType === 'exact').length, 0),
    possible: rows.reduce((total, row) => total + row.advisories.matches.filter(match => match.matchType === 'possible').length, 0),
  },
}

const report = { summary, rows }
await writeFile(`./tmp-nuxt-fyi-page-${page}.json`, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(`./tmp-nuxt-fyi-page-${page}.md`, toMarkdown(report))
console.log(JSON.stringify(summary, null, 2))
