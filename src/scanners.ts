// Pure scanners for callers that already hold the HTML or JavaScript, such as a crawler.
// They make no network requests.
export { scanHtml } from './detect/html.ts'
export type { HtmlScanOptions, HtmlScanResult } from './detect/html.ts'
export { scanJs } from './detect/js.ts'
export type { JsScanOptions } from './detect/js.ts'
