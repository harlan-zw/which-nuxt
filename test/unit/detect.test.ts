import type { DetectCacheArtifact } from '../../src/index.ts'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { describe, expect, it } from 'vitest'
import { detectNuxt } from '../../src/index.ts'

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

  it('extracts exact Nuxt version from generator meta', async () => {
    const result = await detectNuxt({
      html: '<meta name="generator" content="Nuxt v3.21.7"><div id="__nuxt"></div>',
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.isNuxt).toBe(true)
    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.21.7')
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

  it('detects prerendered SSG payload markers', async () => {
    const result = await detectNuxt({
      html: '<script id="__NUXT_DATA__" data-ssr="true">[{"prerenderedAt":1780897194705}]</script>',
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.rendering.mode).toBe('ssg')
  })

  it('detects SPA no-SSR markers', async () => {
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script id="__NUXT_DATA__" data-ssr="false">[]</script>',
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.rendering.mode).toBe('spa')
  })

  it('extracts exact Nuxt version from JS getter pattern', async () => {
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

  it('extracts the Nuxt version getter when it sits past the heuristic byte budget', async () => {
    // The version getter is emitted near the end of the entry chunk, often well
    // beyond maxJsBytes. A decoy version sits inside the bounded prefix to ensure
    // the precise getter still wins over the fuzzy near-needle heuristic.
    const filler = `;const decoy="vue 1.2.3";${'a'.repeat(120_000)};`
    const js = `${filler}nuxtApp={versions:{get nuxt(){return"4.2.2"},get vue(){return e.version}}};defineNuxtPlugin(()=>{})`
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/entry.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      maxJsBytes: 50_000,
      fetch: async (input) => {
        const url = String(input)
        return new Response(url.endsWith('/_nuxt/entry.js') ? js : '', {
          headers: { 'content-type': 'application/javascript' },
        })
      },
    })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('4.2.2')
    expect(result.signals.map(signal => signal.name)).toContain('js:nuxt-getter-version')
  })

  it('does not misattribute the Nuxt version to vue from the runtime versions block', async () => {
    // The vue getter returns a runtime expression, so the literal nearest the vue
    // needle is Nuxt's. A genuine vue version sits beside createApp and should win.
    const js = `const version="3.5.26";function createApp(){};`
      + `nuxtApp={versions:{get nuxt(){return"3.16.2"},get vue(){return e.vueApp.version}}};defineNuxtPlugin(()=>{})`
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/entry.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      fetch: async (input) => {
        const url = String(input)
        return new Response(url.endsWith('/_nuxt/entry.js') ? js : '', {
          headers: { 'content-type': 'application/javascript' },
        })
      },
    })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.16.2')
    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('3.5.26')
  })

  it('ignores a non-Nuxt soft-404 /_payload.json that only contains a bare data key', async () => {
    const result = await detectNuxt('https://example.com/', {
      scanJs: false,
      hosting: false,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/_payload.json')) {
          return new Response('{"data":null,"error":true,"message":"Page not found"}', {
            headers: { 'content-type': 'application/json' },
          })
        }
        // Non-Nuxt page: a jQuery CMS with no Nuxt markers.
        if (url === 'https://example.com/')
          return new Response('<!DOCTYPE html><html><head><title>News</title></head><body></body></html>')
        return new Response('', { status: 404 })
      },
    })

    expect(result.signals.map(signal => signal.name)).not.toContain('endpoint:nuxt-payload')
    expect(result.isNuxt).toBe(false)
  })

  it('accepts a genuine prerendered /_payload.json devalue payload', async () => {
    const result = await detectNuxt('https://example.com/', {
      scanJs: false,
      hosting: false,
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/_payload.json')) {
          return new Response('[{"data":-1,"prerenderedAt":-1}]', {
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url === 'https://example.com/')
          return new Response('<!DOCTYPE html><html><head><title>App</title></head><body></body></html>')
        return new Response('', { status: 404 })
      },
    })

    expect(result.signals.map(signal => signal.name)).toContain('endpoint:nuxt-payload')
  })

  it('detects nuxt-og-image from the legacy /__og-image__/ route as well as /_og/', async () => {
    const result = await detectNuxt({
      html: `
        <div id="__nuxt"></div>
        <meta property="og:image" content="https://example.com/__og-image__/static/og.png">
      `,
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.modules.map(module => module.packageName)).toContain('nuxt-og-image')
  })

  it('detects Nuxt SEO modules from public HTML markers', async () => {
    const result = await detectNuxt({
      html: `
        <div id="__nuxt"></div>
        <script id="__NUXT_DATA__">[]</script>
        <script type="application/ld+json" data-nuxt-schema-org>{"@context":"https://schema.org","@type":"WebSite"}</script>
        <meta property="og:image" content="https://example.com/_og/d/example.png">
        <script id="nuxt-og-image-options" type="application/json">{}</script>
      `,
      url: 'https://example.com/',
    }, {
      scanJs: false,
      probeEndpoints: false,
    })

    expect(result.modules.find(module => module.packageName === 'nuxt-schema-org')?.certainty).toBe('confirmed')
    expect(result.modules.find(module => module.packageName === 'nuxt-og-image')?.certainty).toBe('confirmed')
  })

  it('detects Nuxt SEO modules and versions from public endpoints', async () => {
    const responses: Record<string, string> = {
      'https://example.com/robots.txt': '# START nuxt-robots (indexable)\nUser-agent: *\n# END nuxt-robots',
      'https://example.com/__sitemap__/debug.json': '{"version":"8.0.15"}',
      'https://example.com/__nuxt-seo-utils/debug.json': '{"version":"8.1.11"}',
      'https://example.com/__site-config__/debug.json': '{"version":"4.0.8"}',
    }

    const result = await detectNuxt('https://example.com/', {
      scanJs: false,
      fetch: async (input) => {
        const url = String(input)
        return new Response(responses[url] || '<div id="__nuxt"></div><script id="__NUXT_DATA__">[]</script>', {
          status: responses[url] || url === 'https://example.com/' ? 200 : 404,
          headers: { 'content-type': url.endsWith('.json') ? 'application/json' : 'text/html' },
        })
      },
    })

    expect(result.modules.find(module => module.packageName === '@nuxtjs/robots')?.certainty).toBe('confirmed')
    expect(result.modules.find(module => module.packageName === '@nuxtjs/sitemap')?.version).toBe('8.0.15')
    expect(result.modules.find(module => module.packageName === 'nuxt-seo-utils')?.version).toBe('8.1.11')
    expect(result.modules.find(module => module.packageName === 'nuxt-site-config')?.version).toBe('4.0.8')
    expect(result.packages.find(pkg => pkg.name === '@nuxtjs/sitemap')?.version).toBe('8.0.15')
    expect(result.modules.find(module => module.packageName === '@nuxtjs/seo')?.certainty).toBe('inferred')
  })

  it('extracts multiline package banners without misattributing vue-router as vue', async () => {
    const js = `
      /*!
       * vue-router v3.6.5
       * Released under the MIT License.
       */
      /*!
       * Vue.js v2.7.16
       * Released under the MIT License.
       */
      /*!
       * vue-i18n v8.28.2
       * Released under the MIT License.
       */
      defineNuxtPlugin(() => {})
    `
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/vendors.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      fetch: async () => new Response(js, {
        headers: { 'content-type': 'application/javascript' },
      }),
    })

    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('2.7.16')
    expect(result.packages.find(pkg => pkg.name === 'vue-router')?.version).toBe('3.6.5')
    expect(result.packages.find(pkg => pkg.name === 'vue-i18n')?.version).toBe('8.28.2')
  })

  it('infers Nuxt 2.18 range from the chunk reload guard', async () => {
    const js = 'defineNuxtPlugin(()=>{});try{q1=parseInt(window.sessionStorage.getItem("nuxt-reload")),(!q1||q1+6e4<de)&&(window.sessionStorage.setItem("nuxt-reload",de),window.location.reload(!0))}catch(Ae){}'
    const result = await detectNuxt({
      html: '<div id="__nuxt"></div><script type="module" src="/_nuxt/app.js"></script>',
      url: 'https://example.com/',
    }, {
      probeEndpoints: false,
      fetch: async () => new Response(js, {
        headers: { 'content-type': 'application/javascript' },
      }),
    })

    const nuxt = result.packages.find(pkg => pkg.name === 'nuxt')
    expect(nuxt?.version).toBeNull()
    expect(nuxt?.versionRange).toBe('>=2.18.0 <=2.18.1')
    expect(nuxt?.certainty).toBe('inferred')
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
