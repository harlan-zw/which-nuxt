import { describe, expect, it } from 'vitest'
import { probeNuxtEndpoints } from '../../src/detect/endpoints.ts'
import { scanHeaders } from '../../src/detect/headers.ts'
import { scanHtml } from '../../src/detect/html.ts'
import { scanJs } from '../../src/detect/js.ts'
import { communityNuxtModuleDetectors } from '../../src/modules/community.ts'
import { officialNuxtModuleDetectors } from '../../src/modules/official.ts'

describe('scanHtml', () => {
  it('extracts exact Nuxt version from generator meta', () => {
    const result = scanHtml('<meta name="generator" content="Nuxt v3.21.7"><div id="__nuxt"></div>', 'https://example.com/')

    expect(result.signals.map(signal => signal.name)).toContain('html:generator-nuxt')
    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.21.7')
  })

  it('does not produce Nuxt signals for generic Vue HTML', () => {
    const result = scanHtml('<div id="app"></div><script src="/assets/app.js"></script>', 'https://example.com/')

    expect(result.signals).toEqual([])
    expect(result.packages).toEqual([])
  })

  it('detects prerendered SSG and SPA payload markers', () => {
    const ssg = scanHtml('<script id="__NUXT_DATA__" data-ssr="true">[{"prerenderedAt":1780897194705}]</script>', 'https://example.com/')
    const spa = scanHtml('<div id="__nuxt"></div><script id="__NUXT_DATA__" data-ssr="false">[]</script>', 'https://example.com/')

    expect(ssg.rendering.mode).toBe('ssg')
    expect(spa.rendering.mode).toBe('spa')
  })

  it('detects Nuxt SEO modules from public HTML markers', () => {
    const result = scanHtml(`
      <div id="__nuxt"></div>
      <script id="__NUXT_DATA__">[]</script>
      <script type="application/ld+json" data-nuxt-schema-org>{"@context":"https://schema.org","@type":"WebSite"}</script>
      <meta property="og:image" content="https://example.com/_og/d/example.png">
      <script id="nuxt-og-image-options" type="application/json">{}</script>
    `, 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === 'nuxt-schema-org')?.certainty).toBe('confirmed')
    expect(result.modules.find(module => module.packageName === 'nuxt-og-image')?.certainty).toBe('confirmed')
  })

  it('detects official and community modules from public HTML markers', () => {
    const result = scanHtml(`
      <html>
        <head>
          <link rel="preload" as="font" type="font/woff2" href="/_fonts/Inter-400-1.woff2" crossorigin>
          <script>window.__NUXT_COLOR_MODE__={preference:'system',value:'dark'}</script>
          <script src="/_scripts/abcdef0123.js"></script>
        </head>
        <body>
          <div id="__nuxt"></div>
          <img src="/_ipx/w_640&f_webp/images/hero.png" srcset="/_ipx/w_320/images/hero.png 320w">
          <span class="iconify i-mdi-home"></span>
          <script id="__NUXT_DATA__" data-ssr="true">[{"pinia":1},{"counter":0}]</script>
        </body>
      </html>
    `, 'https://example.com/', { moduleDetectors: [...officialNuxtModuleDetectors, ...communityNuxtModuleDetectors] })

    const byName = (name: string) => result.modules.find(module => module.packageName === name)
    expect(byName('@nuxt/image')?.certainty).toBe('confirmed')
    expect(byName('@nuxt/fonts')?.certainty).toBe('confirmed')
    expect(byName('@nuxtjs/color-mode')?.certainty).toBe('confirmed')
    expect(byName('@nuxt/scripts')?.certainty).toBe('confirmed')
    expect(byName('@nuxt/icon')?.certainty).toBe('inferred')
    expect(byName('@pinia/nuxt')?.certainty).toBe('possible')
  })

  it('only flags nuxt-schema-org from module markers, not generic JSON-LD', () => {
    const generic = scanHtml(`
      <div id="__nuxt"></div><script id="__NUXT_DATA__">[]</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
    `, 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })
    expect(generic.modules.find(module => module.packageName === 'nuxt-schema-org')).toBeUndefined()

    const module = scanHtml(`
      <div id="__nuxt"></div>
      <script type="application/ld+json" id="schema-org-graph">{"@context":"https://schema.org","@graph":[]}</script>
    `, 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })
    expect(module.modules.find(item => item.packageName === 'nuxt-schema-org')?.certainty).toBe('confirmed')
  })

  it('does not flag @nuxt/icon for @iconify/vue iconify-- classes', () => {
    const iconifyVue = scanHtml('<div id="__nuxt"></div><span class="iconify iconify--mdi"></span>', 'https://example.com/', { moduleDetectors: officialNuxtModuleDetectors })
    expect(iconifyVue.modules.find(module => module.packageName === '@nuxt/icon')).toBeUndefined()

    const nuxtIcon = scanHtml('<div id="__nuxt"></div><span class="iconify i-mdi-home"></span>', 'https://example.com/', { moduleDetectors: officialNuxtModuleDetectors })
    expect(nuxtIcon.modules.find(module => module.packageName === '@nuxt/icon')?.certainty).toBe('inferred')
  })

  it('detects individual stylesheet and route HTML markers', () => {
    const vuetify = scanHtml('<div id="__nuxt"></div><style id="vuetify-theme-stylesheet">:root{}</style>', 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })
    const nuxtUi = scanHtml('<style id="nuxt-ui-colors">@layer theme{:root{--ui-primary:var(--ui-color-primary-500)}}</style>', 'https://example.com/', { moduleDetectors: officialNuxtModuleDetectors })
    const ogImage = scanHtml('<meta property="og:image" content="https://example.com/__og-image__/static/og.png">', 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })

    expect(vuetify.modules.find(module => module.packageName === 'vuetify-nuxt-module')?.certainty).toBe('inferred')
    expect(nuxtUi.modules.find(module => module.packageName === '@nuxt/ui')?.certainty).toBe('confirmed')
    expect(ogImage.modules.map(module => module.packageName)).toContain('nuxt-og-image')
  })

  it('does not infer @nuxtjs/i18n from generic hreflang alternates', () => {
    const result = scanHtml(`
      <div id="__nuxt"></div>
      <link rel="alternate" hreflang="en" href="https://example.com/en">
      <link rel="alternate" hreflang="x-default" href="https://example.com/">
    `, 'https://example.com/', { moduleDetectors: communityNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === '@nuxtjs/i18n')).toBeUndefined()
  })
})

describe('scanJs', () => {
  it('extracts exact Nuxt and package versions from JavaScript', () => {
    const js = '/** vue v3.5.13 */;/** @nuxt/content v3.7.0 */;class Versions{get nuxt(){return"3.11.2"}};defineNuxtPlugin(()=>{})'
    const result = scanJs(js, { moduleDetectors: officialNuxtModuleDetectors })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.11.2')
    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('3.5.13')
    expect(result.packages.find(pkg => pkg.name === '@nuxt/content')?.version).toBe('3.7.0')
    expect(result.signals.map(signal => signal.name)).toContain('js:nuxt-getter-version')
  })

  it('extracts the Nuxt version getter when it sits past the heuristic byte budget', () => {
    const filler = `;const decoy="vue 1.2.3";${'a'.repeat(120_000)};`
    const js = `${filler}nuxtApp={versions:{get nuxt(){return"4.2.2"},get vue(){return e.version}}};defineNuxtPlugin(()=>{})`
    const result = scanJs(js, { heuristicBytes: 50_000 })

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('4.2.2')
    expect(result.signals.map(signal => signal.name)).toContain('js:nuxt-getter-version')
  })

  it('does not misattribute the Nuxt version to vue from the runtime versions block', () => {
    const js = `const version="3.5.26";function createApp(){};`
      + `nuxtApp={versions:{get nuxt(){return"3.16.2"},get vue(){return e.vueApp.version}}};defineNuxtPlugin(()=>{})`
    const result = scanJs(js)

    expect(result.packages.find(pkg => pkg.name === 'nuxt')?.version).toBe('3.16.2')
    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('3.5.26')
  })

  it('extracts multiline package banners without misattributing vue-router as vue', () => {
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
    const result = scanJs(js)

    expect(result.packages.find(pkg => pkg.name === 'vue')?.version).toBe('2.7.16')
    expect(result.packages.find(pkg => pkg.name === 'vue-router')?.version).toBe('3.6.5')
    expect(result.packages.find(pkg => pkg.name === 'vue-i18n')?.version).toBe('8.28.2')
  })

  it('infers Nuxt 2.18 range from the chunk reload guard', () => {
    const js = 'defineNuxtPlugin(()=>{});try{q1=parseInt(window.sessionStorage.getItem("nuxt-reload")),(!q1||q1+6e4<de)&&(window.sessionStorage.setItem("nuxt-reload",de),window.location.reload(!0))}catch(Ae){}'
    const result = scanJs(js)
    const nuxt = result.packages.find(pkg => pkg.name === 'nuxt')

    expect(nuxt?.version).toBeNull()
    expect(nuxt?.versionRange).toBe('>=2.18.0 <=2.18.1')
    expect(nuxt?.certainty).toBe('inferred')
  })
})

describe('probeNuxtEndpoints', () => {
  it('ignores a non-Nuxt soft-404 /_payload.json that only contains a bare data key', async () => {
    const result = await probeNuxtEndpoints('https://example.com/', {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/_payload.json')) {
          return new Response('{"data":null,"error":true,"message":"Page not found"}', {
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response('', { status: 404 })
      },
    })

    expect(result.signals.map(signal => signal.name)).not.toContain('endpoint:nuxt-payload')
  })

  it('accepts a genuine prerendered /_payload.json devalue payload', async () => {
    const result = await probeNuxtEndpoints('https://example.com/', {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/_payload.json')) {
          return new Response('[{"data":-1,"prerenderedAt":-1}]', {
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response('', { status: 404 })
      },
    })

    expect(result.signals.map(signal => signal.name)).toContain('endpoint:nuxt-payload')
  })

  it('confirms @nuxt/content from its public sql dump endpoint', async () => {
    const result = await probeNuxtEndpoints('https://example.com/', {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/__nuxt_content/content/sql_dump.txt'))
          return new Response('eJxLLEvMUah...', { headers: { 'content-type': 'text/plain' } })
        return new Response('', { status: 404 })
      },
    }, { moduleDetectors: officialNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === '@nuxt/content')?.certainty).toBe('confirmed')
  })

  it('does not confirm @nuxt/content when an SPA catch-all returns an HTML shell for the sql dump path', async () => {
    const result = await probeNuxtEndpoints('https://example.com/', {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/__nuxt_content/content/sql_dump.txt'))
          return new Response('<!doctype html><html><body>not found</body></html>')
        return new Response('', { status: 404 })
      },
    }, { moduleDetectors: officialNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === '@nuxt/content')).toBeUndefined()
  })

  it('ignores generic llms.txt without nuxt-ai-ready markers', async () => {
    const result = await probeNuxtEndpoints('https://example.com/', {
      fetch: async (input) => {
        const url = String(input)
        if (url.endsWith('/llms.txt'))
          return new Response('# My Site\n\n> A description\n\n## Docs\n\n- [Home](/)\n', { headers: { 'content-type': 'text/plain' } })
        return new Response('', { status: 404 })
      },
    }, { moduleDetectors: communityNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === 'nuxt-ai-ready')).toBeUndefined()
  })
})

describe('scanHeaders', () => {
  it('infers nuxt-security from its default response header set', () => {
    const result = scanHeaders({
      'x-xss-protection': '0',
      'origin-agent-cluster': '?1',
      'x-permitted-cross-domain-policies': 'none',
      'x-content-type-options': 'nosniff',
    }, { moduleDetectors: communityNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === 'nuxt-security')?.certainty).toBe('inferred')
  })

  it('infers @nuxtjs/i18n from its redirect cookie', () => {
    const result = scanHeaders({
      'set-cookie': 'i18n_redirected=en; Path=/',
    }, { moduleDetectors: communityNuxtModuleDetectors })

    expect(result.modules.find(module => module.packageName === '@nuxtjs/i18n')?.certainty).toBe('inferred')
  })
})
