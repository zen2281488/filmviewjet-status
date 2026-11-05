import { normalizeDocument } from '../shared/normalize-document.ts'
import { asObject } from '../shared/read-json.ts'
import type { JsonValue, SourceConfig } from '../shared/types.ts'
import { decodeFirestoreValue } from './decode-firestore-value.ts'
import type { SourceStatus } from './types.ts'

const SOURCE_TIMEOUT_MILLISECONDS = 3000

/**
 * Tries one URL for the source. The deadline covers both the response and
 * reading its body, so an unavailable monitor cannot hold a tab open.
 *
 * @param {SourceConfig} source The source.
 * @param {string} address The primary or backup document URL.
 * @param {string} baseUrl The page's address, which relative source URLs start from.
 * @param {typeof fetch} fetchFunction The fetch to use, replaceable in tests.
 * @returns {Promise<SourceStatus>} The document, or why there isn't one.
 */
async function readSourceDocument(
  source: SourceConfig,
  address: string,
  baseUrl: string,
  fetchFunction: typeof fetch,
): Promise<SourceStatus> {
  try {
    const url = new URL(address, baseUrl)

    // Skips the browser's and the host's caches, so the page shows the
    // newest check instead of one from ten minutes ago.
    if (url.origin === new URL(baseUrl).origin) {
      url.searchParams.set('fresh', String(Date.now()))
    }

    const response = await fetchFunction(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MILLISECONDS),
    })

    if (!response.ok) {
      return { source, state: 'empty', document: undefined }
    }

    const body = (await response.json()) as JsonValue
    const plain =
      source.format === 'firestore'
        ? decodeFirestoreValue({
            mapValue: { fields: asObject(body)?.fields ?? {} },
          })
        : body
    const status = normalizeDocument(plain)

    return status
      ? { source, state: 'loaded', document: status }
      : { source, state: 'empty', document: undefined }
  } catch {
    return { source, state: 'unreachable', document: undefined }
  }
}

/**
 * Loads the live document or, if it is unavailable, the last published copy.
 * A live document that reports an outage is a successful read.
 *
 * @param {SourceConfig} source The source.
 * @param {string} baseUrl The page's address, which relative source URLs start from.
 * @param {typeof fetch} fetchFunction The fetch to use, replaceable in tests.
 * @returns {Promise<SourceStatus>} The live status or its backup.
 */
async function loadSource(
  source: SourceConfig,
  baseUrl: string,
  fetchFunction: typeof fetch = fetch,
): Promise<SourceStatus> {
  const live = await readSourceDocument(
    source,
    source.url,
    baseUrl,
    fetchFunction,
  )

  if (live.document || !source.fallbackUrl) {
    return live
  }

  const fallback = await readSourceDocument(
    source,
    source.fallbackUrl,
    baseUrl,
    fetchFunction,
  )
  return fallback.document ? { ...fallback, fromFallback: true } : live
}

export { loadSource }
