import { runCommand } from 'citty'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../src/cli.ts'

const NUXT_HTML = '<meta name="generator" content="Nuxt 3.0.0"><div id="__nuxt"></div>'

const TEST_ADVISORY = {
  ghsa_id: 'GHSA-1111-1111-1111',
  html_url: 'https://github.com/advisories/GHSA-1111-1111-1111',
  severity: 'low',
  summary: 'Test advisory for nuxt 3.0.0',
  published_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  vulnerabilities: [{
    package: { ecosystem: 'npm', name: 'nuxt' },
    vulnerable_version_range: '< 3.8.0',
    first_patched_version: '3.8.0',
  }],
}

function chunkHtml(count: number) {
  const links = Array.from({ length: count }, (_, i) => `<link rel="modulepreload" as="script" crossorigin href="/_nuxt/chunk-${i}.js">`)
  return `<!doctype html><html><head><title>Example Nuxt</title></head><body><div id="__nuxt"></div>${links.join('')}</body></html>`
}

describe('whichnuxt CLI', () => {
  it('fetches the documented default number of js chunks when --max-js-requests is unset', async () => {
    const chunkUrls: string[] = []
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.includes('/_nuxt/'))
        chunkUrls.push(url)
      return new Response(chunkHtml(6), { headers: { 'content-type': 'text/html' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    await runCommand(main, {
      rawArgs: ['https://example.com/', '--json', '--no-endpoints', '--no-hosting', '--no-advisories'],
    })

    expect(chunkUrls.length).toBe(4)
  })
})

describe('whichnuxt CLI failure and exit codes', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    process.exitCode = 0
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mockConsola() {
    return {
      box: vi.spyOn(consola, 'box').mockImplementation(() => {}),
      info: vi.spyOn(consola, 'info').mockImplementation(() => {}),
      start: vi.spyOn(consola, 'start').mockImplementation(() => {}),
      success: vi.spyOn(consola, 'success').mockImplementation(() => {}),
      warn: vi.spyOn(consola, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(consola, 'error').mockImplementation(() => {}),
    }
  }

  it('prints a one-line error and sets exit code 1 for a bad --timeout value', async () => {
    const output = mockConsola()

    await runCommand(main, { rawArgs: ['https://example.com/', '--timeout', '1.5'] })

    expect(output.error).toHaveBeenCalledWith('--timeout must be a positive integer.')
    expect(process.exitCode).toBe(1)
  })

  it('does not print the success line when every advisory request fails', async () => {
    const output = mockConsola()
    vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com'))
        return new Response('Bad credentials', { status: 401 })
      return new Response(NUXT_HTML, { headers: { 'content-type': 'text/html' } })
    }))

    await runCommand(main, { rawArgs: ['https://example.com/', '--no-endpoints', '--no-hosting', '--no-js'] })

    expect(output.success).not.toHaveBeenCalledWith('No advisories matched exact detected package versions.')
    expect(output.warn).toHaveBeenCalledWith('Some advisory checks failed:')
  })

  it('sets exit code 3 when an advisory matches the detected version', async () => {
    const output = mockConsola()
    vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com'))
        return new Response(JSON.stringify([TEST_ADVISORY]), { headers: { 'content-type': 'application/json' } })
      return new Response(NUXT_HTML, { headers: { 'content-type': 'text/html' } })
    }))

    await runCommand(main, { rawArgs: ['https://example.com/', '--no-endpoints', '--no-hosting', '--no-js'] })

    expect(process.exitCode).toBe(3)
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('1 advisory match(es)'))
  })

  it('sets exit code 2 when the scan cannot fetch the target', async () => {
    const output = mockConsola()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed')
    }))

    await runCommand(main, { rawArgs: ['https://example.com/', '--no-advisories'] })

    expect(process.exitCode).toBe(2)
    expect(output.warn).toHaveBeenCalledWith('Some scan steps failed:')
  })
})
