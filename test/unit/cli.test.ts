import { runCommand } from 'citty'
import { describe, expect, it, vi } from 'vitest'
import { main } from '../../src/cli.ts'

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
