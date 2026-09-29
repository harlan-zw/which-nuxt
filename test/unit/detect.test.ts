import type { DetectCacheArtifact } from '../../src/index.ts'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { describe, expect, it } from 'vitest'
import { detectNuxt } from '../../src/index.ts'
import { communityNuxtModuleDetectors } from '../../src/modules/community.ts'
import { officialNuxtModuleDetectors } from '../../src/modules/official.ts'

describe('detectNuxt', () => {
  it('detects Nuxt from __NUXT_DATA__ using ultrahtml parsing', async () => {
    const result = await detectNuxt({
      url: 'https://example.com/',
      html: `
        <!doctype html>
        <html>
          <head><title>Example Nuxt</title></head>
          <body>
            <div id="__nuxt"></div>
            <script type="application/json" id="__NUXT_DATA__" data-ssr="true" data-src="/_payload.json">[{"serverRendered":true}]</script>
            <script type="module" src="/_nuxt/entry.abc.js"></script>
          </body>
        </html>
      `,
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.isNuxt).toBe(true)
    expect(result.title).toBe('Example Nuxt')
    expect(result.rendering.mode).toBe('ssr')
    expect(result.signals.map(signal => signal.name)).toContain('html:nuxt-data')
    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBeNull()
  })

  it('does not classify generic Vue HTML as Nuxt', async () => {
    const result = await detectNuxt({
      html: '<div id="app"></div><script src="/assets/app.js"></script>',
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.isNuxt).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('detects hosting provider from response headers', async () => {
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script id="__NUXT_DATA__">[]</script>',
      url: 'https://example.com/',
      headers: {
        'cf-ray': 'abc',
        'server': 'cloudflare',
      },
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.hosting?.provider).toBe('Cloudflare')
  })

  it('scans modulepreload chunks when the entry script does not carry the version', async () => {
    const fetched: string[] = []
    const result = await detectNuxt({
      html: `<div id="__nuxt"></div>
        <link rel="modulepreload" as="script" crossorigin href="/_nuxt/BQQGMP_W.js">
        <link rel="modulepreload" as="script" crossorigin href="/_nuxt/Cz9x.js">
        <script type="module" src="/_nuxt/entry.js"></script>`,
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      fetch: async (input) => {
        const url = String(input)
        fetched.push(url)
        const body = url.endsWith('/_nuxt/BQQGMP_W.js')
          ? 'var Fs=`3.5.42`;const a={_uid:u++,_component:e,version:Fs};nuxtApp={versions:{get nuxt(){return`4.5.2`},get vue(){return e.version}}};defineNuxtPlugin(()=>{})'
          : 'import"./BQQGMP_W.js";'
        return new Response(body, { headers: { 'content-type': 'application/javascript' } })
      },
    })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('4.5.2')
    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('3.5.42')
    expect(fetched).not.toContain('https://example.com/_nuxt/Cz9x.js')
  })

  it('does not count a latest.json response without a build id as Nuxt evidence', async () => {
    const result = await detectNuxt({
      html: '<html><body><div id="app"></div></body></html>',
      url: 'https://example.com/',
    }, {
      scanJs: false,
      fetch: async () => new Response('<!doctype html><html>Laravel</html>', { headers: { 'content-type': 'text/html' } }),
    })

    expect(result.signals.map(signal => signal.name)).not.toContain('endpoint:nuxt-build-latest')
    expect(result.isNuxt).toBe(false)
  })

  it('identifies itself with a which-nuxt User-Agent by default', async () => {
    const agents: string[] = []
    await detectNuxt('https://example.com/', {
      probeEndpoints: false,
      hosting: false,
      fetch: async (_input, init) => {
        agents.push(new Headers(init?.headers).get('user-agent') || '')
        return new Response('<div id="__nuxt"></div>', { headers: { 'content-type': 'text/html' } })
      },
    })

    expect(agents).toEqual([expect.stringMatching(/^which-nuxt\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/harlan-zw\/which-nuxt\)$/)])
  })

  it('fetches and scans Nuxt JavaScript chunks', async () => {
    const js = '/** vue v3.5.13 */;/** @nuxt/content v3.7.0 */;class Versions{get nuxt(){return"3.11.2"}};defineNuxtPlugin(()=>{})'
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/app.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      fetch: async (input) => {
        const url = String(input)
        return new Response(url.endsWith('/_nuxt/app.js') ? js : '', {
          headers: { 'content-type': 'application/javascript' },
        })
      },
    })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.11.2')
    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('3.5.13')
    expect(result.packages.find(pkg => pkg.name === '@nuxt/content')?.version).toBe('3.7.0')
    expect(result.signals.map(signal => signal.name)).toContain('js:nuxt-getter-version')
  })

  it('applies the timeout to a response body that stalls after the headers', async () => {
    // Mirrors real fetch: headers arrive, then the body only settles when the signal aborts.
    function stalledBody(signal: AbortSignal | null | undefined) {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('/** vue v3.5.13 */'))
          signal?.addEventListener('abort', () => controller.error(signal.reason))
        },
      })
    }

    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/app.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      hosting: false,
      timeout: 50,
      fetch: async (_input, init) => new Response(stalledBody(init?.signal), {
        headers: { 'content-type': 'application/javascript' },
      }),
    })

    expect(result.errors).toEqual([expect.stringContaining('https://example.com/_nuxt/app.js')])
  }, 1000)

  it('detects Nuxt SEO modules and versions from public endpoints', async () => {
    const responses: Record<string, string> = {
      'https://example.com/robots.txt': '# START nuxt-robots (indexable)\nUser-agent: *\n# END nuxt-robots',
      'https://example.com/__sitemap__/debug.json': '{"version":"8.0.15"}',
      'https://example.com/__nuxt-seo-utils/debug.json': '{"version":"8.1.11"}',
      'https://example.com/__site-config__/debug.json': '{"version":"4.0.8"}',
    }

    const result = await detectNuxt('https://example.com/', {
      scanJs: false,
      hosting: false,
      fetch: async (input) => {
        const url = String(input)
        if (responses[url]) {
          return new Response(responses[url], {
            headers: { 'content-type': url.endsWith('.json') ? 'application/json' : 'text/plain' },
          })
        }
        if (url === 'https://example.com/')
          return new Response('<div id="__nuxt"></div><script id="__NUXT_DATA__">[]</script>')
        return new Response('', { status: 404 })
      },
    })

    expect(result.modules.find(module => module.packageName === '@nuxtjs/robots')?.certainty).toBe('confirmed')
    expect(result.modules.find(module => module.packageName === '@nuxtjs/sitemap')?.version).toBe('8.0.15')
    expect(result.modules.find(module => module.packageName === 'nuxt-seo-utils')?.version).toBe('8.1.11')
    expect(result.modules.find(module => module.packageName === 'nuxt-site-config')?.version).toBe('4.0.8')
    expect(result.packages.find(pkg => pkg.name === '@nuxtjs/sitemap')?.version).toBe('8.0.15')
    expect(result.modules.find(module => module.packageName === '@nuxtjs/seo')?.certainty).toBe('inferred')
  })

  it('can scope module detection to official or community presets', async () => {
    const input = {
      html: `
        <div id="__nuxt"></div>
        <script id="__NUXT_DATA__">[{"pinia":1}]</script>
        <img src="/_ipx/w_640/hero.png">
        <script>window.__NUXT_COLOR_MODE__={value:'dark'}</script>
      `,
      url: 'https://example.com/',
    }

    const official = await detectNuxt(input, {
      moduleDetectors: officialNuxtModuleDetectors,
      scanJs: false,
      probeEndpoints: false,
    })
    expect(official.modules.map(module => module.packageName)).toContain('@nuxt/image')
    expect(official.modules.map(module => module.packageName)).not.toContain('@nuxtjs/color-mode')
    expect(official.modules.map(module => module.packageName)).not.toContain('@pinia/nuxt')

    const community = await detectNuxt(input, {
      moduleDetectors: communityNuxtModuleDetectors,
      scanJs: false,
      probeEndpoints: false,
    })
    expect(community.modules.map(module => module.packageName)).toContain('@nuxtjs/color-mode')
    expect(community.modules.map(module => module.packageName)).toContain('@pinia/nuxt')
    expect(community.modules.map(module => module.packageName)).not.toContain('@nuxt/image')

    const disabled = await detectNuxt(input, {
      moduleDetectors: false,
      scanJs: false,
      probeEndpoints: false,
    })
    expect(disabled.isNuxt).toBe(true)
    expect(disabled.modules).toEqual([])
  })

  it('detects nuxt-ai-ready from combined public markers', async () => {
    const result = await detectNuxt('https://example.com/', {
      hosting: false,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/__ai-ready__/debug.json'))
          return new Response('{"version":"1.2.3","siteConfigUrl":"https://example.com","llmsTxtCacheSeconds":600}', { headers: { 'content-type': 'application/json' } })
        if (url.endsWith('/llms.txt'))
          return new Response('# Example\n\nCanonical Origin: https://example.com\n\n## Pages\n', { headers: { 'content-type': 'text/plain' } })
        if (url === 'https://example.com/')
          return new Response('<div id="__nuxt"></div><link rel="alternate" type="text/markdown" href="/index.md"><script id="__NUXT_DATA__">[]</script>')
        return new Response('', { status: 404 })
      },
    })

    expect(result.modules.find(module => module.packageName === 'nuxt-ai-ready')?.certainty).toBe('confirmed')
    expect(result.packages.find(pkg => pkg.name === 'nuxt-ai-ready')?.version).toBe('1.2.3')
  })

  it('can cache and reuse the detection artifact with unstorage', async () => {
    const cache = createStorage<DetectCacheArtifact>({ driver: memoryDriver() })
    let calls = 0
    const fetch = async () => {
      calls += 1
      return new Response('<div id="__nuxt"></div><script id="__NUXT_DATA__">[]</script>', {
        headers: { 'content-type': 'text/html' },
      })
    }

    const first = await detectNuxt('https://example.com/', {
      cache,
      fetch,
      scanJs: false,
      probeEndpoints: false,
    })
    const second = await detectNuxt('https://example.com/', {
      cache,
      fetch,
      scanJs: false,
      probeEndpoints: false,
    })

    expect(first.cache?.hit).toBe(false)
    expect(second.cache?.hit).toBe(true)
    expect(second.isNuxt).toBe(true)
    expect(calls).toBe(1)
  })
})
