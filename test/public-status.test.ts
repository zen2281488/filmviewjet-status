import { describe, expect, it } from 'vitest'
import { applyResults } from '../monitor/apply-results.ts'
import {
  PUBLIC_CHECK_FAILURE,
  isPublicDocument,
  retainPublicHistory,
} from '../monitor/public-status.ts'
import { createConfig, createResult, createTarget } from './fixtures.ts'

describe('public Pages history', () => {
  it('keeps the API uptime and drops every detail from other checks', () => {
    const now = Date.parse('2026-10-04T12:00:00Z')
    const publicApi = createTarget('api', { label: 'Public API' })
    const previous = applyResults(
      undefined,
      createConfig(),
      [
        createResult('api', { up: false, error: 'internal request details' }),
        createResult('website', {
          up: false,
          error: 'private provider failed',
        }),
      ],
      now,
      'Old collector',
    )
    const retained = retainPublicHistory(previous, publicApi)
    expect(Object.keys(retained?.targets ?? {})).toEqual(['api'])
    expect(retained?.targets.api?.days['2026-10-04']?.checks).toBe(1)
    expect(retained?.targets.api?.lastError).toBe(PUBLIC_CHECK_FAILURE)
    expect(retained?.incidents).toMatchObject([
      {
        targetId: 'api',
        targetLabel: 'Public API',
        error: PUBLIC_CHECK_FAILURE,
      },
    ])
    expect(JSON.stringify(retained)).not.toMatch(
      /website|private provider|internal request details|Old collector/u,
    )

    const publicStatus = applyResults(
      retained,
      { ...createConfig(), targets: [publicApi] },
      [createResult('api')],
      now + 300_000,
      'GitHub Actions',
    )
    expect(isPublicDocument(publicStatus, publicApi)).toBe(true)
    expect(
      isPublicDocument(
        { ...publicStatus, incidents: previous.incidents },
        publicApi,
      ),
    ).toBe(false)
    const withStandSnapshot = { ...publicStatus, standSnapshot: {} }
    expect(isPublicDocument(withStandSnapshot, publicApi)).toBe(false)
  })
})
