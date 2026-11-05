import { describe, expect, it, vi } from 'vitest'
import { decodeFirestoreValue } from '../app/decode-firestore-value.ts'
import { loadSource } from '../app/load-source.ts'
import { readPreviousDocument } from '../monitor/read-previous-document.ts'
import { normalizeDocument } from '../shared/normalize-document.ts'
import type { JsonValue } from '../shared/types.ts'

const SAVED: JsonValue = {
  updatedAt: 1_790_000_000_000,
  intervalMinutes: 5,
  checkedFrom: 'GitHub Actions',
  targets: {
    website: {
      id: 'website',
      label: 'Website',
      group: 'Public',
      status: 'down',
      lastError: 'HTTP 503',
      days: {
        '2026-10-04': { checks: 3, failures: 1, latencyTotalMilliseconds: 300 },
        'not-a-day': { checks: 9 },
      },
    },
  },
  incidents: [{ id: 'one', targetId: 'website', startedAt: 5 }, 'junk'],
}

describe('normalizeDocument', () => {
  it('keeps what it recognises and fills in the rest', () => {
    const statusDocument = normalizeDocument(SAVED)

    expect(statusDocument?.targets.website).toMatchObject({
      status: 'down',
      lastError: 'HTTP 503',
      consecutiveFailures: 0,
      days: {
        '2026-10-04': {
          checks: 3,
          failures: 1,
          latencyTotalMilliseconds: 300,
          latencyMaxMilliseconds: 0,
        },
      },
    })
    expect(Object.keys(statusDocument?.targets.website?.days ?? {})).toEqual([
      '2026-10-04',
    ])
    expect(statusDocument?.incidents).toHaveLength(1)
    expect(statusDocument?.incidents[0]?.endedAt).toBe(0)
  })

  it('reads documents from other monitors, ignoring their extra fields', () => {
    const statusDocument = normalizeDocument({
      cell: 'quick-casa',
      region: 'northamerica-northeast1',
      updatedAt: 1,
      targets: { api: { label: 'API', status: 'sideways', scope: 'cell' } },
    })

    expect(statusDocument?.targets.api).toMatchObject({
      id: 'api',
      label: 'API',
      status: 'operational',
    })
  })

  it('rejects anything without a targets map', () => {
    expect(normalizeDocument(undefined)).toBeUndefined()
    expect(normalizeDocument({ incidents: [] })).toBeUndefined()
  })
})

describe('decodeFirestoreValue', () => {
  it('unwraps typed values, including 64 bit integers sent as strings', () => {
    expect(
      decodeFirestoreValue({
        mapValue: {
          fields: {
            label: { stringValue: 'Email' },
            checks: { integerValue: '288' },
            average: { doubleValue: 12.5 },
            ok: { booleanValue: true },
            empty: { mapValue: {} },
            list: { arrayValue: { values: [{ integerValue: '1' }] } },
            nothing: { nullValue: null },
            time: { timestampValue: '2026-10-04T00:00:00Z' },
          },
        },
      }),
    ).toEqual({
      label: 'Email',
      checks: 288,
      average: 12.5,
      ok: true,
      empty: {},
      list: [1],
      nothing: null,
      time: null,
    })
  })
})

/**
 * Makes a fake fetch that answers every call with a fresh response.
 *
 * @param {() => Response} makeResponse Builds the response.
 * @returns {ReturnType<typeof vi.fn<typeof fetch>>} The fake.
 */
function respondWith(makeResponse: () => Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(makeResponse()))
}

describe('readPreviousDocument', () => {
  const warn = vi.fn<(message: string) => void>()

  it('starts fresh when nothing is published yet', async () => {
    const fetchFunction = respondWith(
      () => new Response('Not found', { status: 404 }),
    )

    const previous = await readPreviousDocument(
      'https://acme.github.io/status-page',
      'site/status.json',
      warn,
      fetchFunction,
    )
    const requested = fetchFunction.mock.calls[0]?.[0]

    expect(previous).toBeUndefined()
    expect(String(requested)).toMatch(
      /^https:\/\/acme\.github\.io\/status-page\/status\.json\?fresh=\d+$/u,
    )
  })

  it('stops instead of wiping the history when the site is unreachable', async () => {
    await expect(
      readPreviousDocument(
        'https://acme.github.io/status-page/',
        'site/status.json',
        warn,
        respondWith(() => new Response('', { status: 503 })),
      ),
    ).rejects.toThrow("Couldn't read the published status.json (HTTP 503)")
  })

  it('warns and starts fresh when the published file is broken', async () => {
    const previous = await readPreviousDocument(
      'https://acme.github.io/status-page/',
      'site/status.json',
      warn,
      respondWith(() => new Response('{ broken')),
    )

    expect(previous).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      "The published status.json isn't valid JSON, so history starts over.",
    )
  })
})

describe('loadSource', () => {
  const stand = {
    label: 'Stand',
    url: 'https://stand.example.test/status-data/status.json',
    fallbackUrl: 'stand-status.json',
    format: 'json',
  } as const
  const pageUrl = 'https://status.example.test/project/'

  it('keeps a live document that reports a service outage', async () => {
    const fetchFunction = respondWith(() => Response.json(SAVED))
    const live = await loadSource(stand, pageUrl, fetchFunction)

    expect(live.document?.targets.website?.status).toBe('down')
    expect(live.fromFallback).toBeUndefined()
    expect(fetchFunction).toHaveBeenCalledTimes(1)
    expect(String(fetchFunction.mock.calls[0]?.[0])).toBe(stand.url)
  })

  it('loads the Pages snapshot after a timed-out live request and keeps the saved history', async () => {
    const fetchFunction = respondWith(() =>
      Response.json(SAVED),
    ).mockRejectedValueOnce(
      new DOMException('The operation timed out.', 'TimeoutError'),
    )
    const status = await loadSource(stand, pageUrl, fetchFunction)

    expect(fetchFunction).toHaveBeenCalledTimes(2)
    expect(fetchFunction.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(String(fetchFunction.mock.calls[1]?.[0])).toMatch(
      /^https:\/\/status\.example\.test\/project\/stand-status\.json\?fresh=\d+$/u,
    )
    expect(status.fromFallback).toBe(true)
    expect(status.source).toEqual(stand)
    expect(status.document).toEqual(normalizeDocument(SAVED))
  })

  it('uses the backup when the live server responds without a status document', async () => {
    const fetchFunction = respondWith(() =>
      Response.json(SAVED),
    ).mockResolvedValueOnce(
      Response.json({ error: 'stand temporarily unavailable' }),
    )

    const status = await loadSource(stand, pageUrl, fetchFunction)

    expect(status.fromFallback).toBe(true)
  })

  it("reads a Firestore document and skips the cache for the page's own file", async () => {
    const fetchFunction = respondWith(() =>
      Response.json({
        fields: {
          updatedAt: { integerValue: '10' },
          targets: {
            mapValue: {
              fields: {
                email: {
                  mapValue: { fields: { label: { stringValue: 'Email' } } },
                },
              },
            },
          },
        },
      }),
    )

    const firestore = await loadSource(
      {
        label: 'Canada',
        url: 'https://firestore.example.test/doc',
        format: 'firestore',
      },
      'https://status.example.test/',
      fetchFunction,
    )
    const own = await loadSource(
      { label: 'Acme', url: 'status.json', format: 'json' },
      'https://status.example.test/',
      fetchFunction,
    )

    expect(firestore.state).toBe('loaded')
    expect(firestore.document?.targets.email?.label).toBe('Email')
    expect(String(fetchFunction.mock.calls[0]?.[0])).toBe(
      'https://firestore.example.test/doc',
    )
    expect(String(fetchFunction.mock.calls[1]?.[0])).toMatch(
      /^https:\/\/status\.example\.test\/status\.json\?fresh=\d+$/u,
    )
    expect(own.state).toBe('empty')
  })

  it('tells an empty source from an unreachable one', async () => {
    const source = {
      label: 'Acme',
      url: 'status.json',
      format: 'json',
    } as const

    const missing = await loadSource(
      source,
      'https://status.example.test/',
      respondWith(() => new Response('', { status: 404 })),
    )
    const offline = await loadSource(
      source,
      'https://status.example.test/',
      vi.fn<typeof fetch>(() =>
        Promise.reject(new TypeError('Failed to fetch')),
      ),
    )

    expect(missing.state).toBe('empty')
    expect(offline.state).toBe('unreachable')
  })
})
