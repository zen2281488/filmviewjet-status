// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { deriveOverallStatus } from '../app/derive-overall-status.ts'
import {
  formatDuration,
  formatRelativeTime,
  formatUptime,
} from '../app/format.ts'
import { orderGroups } from '../app/order-groups.ts'
import { renderPage } from '../app/render/render-page.ts'
import { summariseTarget } from '../app/summarise-target.ts'
import type { SourceStatus } from '../app/types.ts'
import { applyResults } from '../monitor/apply-results.ts'
import { MILLISECONDS_PER_DAY } from '../shared/constants.ts'
import { createConfig, createResult } from './fixtures.ts'

const NOW = Date.parse('2026-10-04T12:00:00Z')

/**
 * Builds a loaded source whose API went down four minutes ago.
 *
 * @param {number} checkedAt When the last check ran.
 * @returns {SourceStatus} The source.
 */
function loadedSource(checkedAt = NOW - 4 * 60_000): SourceStatus {
  const statusDocument = applyResults(
    undefined,
    createConfig(),
    [
      createResult('website'),
      createResult('api', { up: false, statusCode: 503, error: 'HTTP 503' }),
    ],
    checkedAt,
    'GitHub Actions',
  )

  return {
    source: { label: 'Acme', url: 'status.json', format: 'json' },
    state: 'loaded',
    document: statusDocument,
  }
}

/**
 * Renders the page into a fresh container and returns its text.
 *
 * @param {readonly SourceStatus[]} statuses The sources.
 * @returns {HTMLElement} The container.
 */
function render(statuses: readonly SourceStatus[]): HTMLElement {
  const container = document.createElement('main')
  container.append(...renderPage(statuses, 0, ['Public'], NOW))
  return container
}

describe('renderPage', () => {
  it('shows the headline, how fresh it is, each target and the open incident', () => {
    const page = render([loadedSource()])
    const text = page.textContent

    expect(page.querySelector('.banner__headline')?.textContent).toBe(
      'Some systems are down',
    )
    expect(text).toContain(
      'Last checked 4 minutes ago from GitHub Actions. Checks run about every 5 minutes.',
    )
    expect(page.querySelectorAll('.row')).toHaveLength(2)
    expect(
      page.querySelector(':scope .row--down .row__error')?.textContent,
    ).toBe('HTTP 503')
    expect(page.querySelectorAll(':scope .row--down .tick')).toHaveLength(90)
    expect(text).toContain('Since 11:56 UTC, ongoing (4 min)')
    expect(page.querySelector('.sources')).toBeNull()
  })

  it('says when the checks have stopped arriving', () => {
    const page = render([loadedSource(NOW - 2 * 60 * 60_000)])

    expect(page.querySelector('.banner__headline')?.textContent).toBe(
      'Status checks are delayed',
    )
    expect(page.textContent).toContain('Last checked 2 hours ago')
  })

  it('labels a backup snapshot and keeps its timestamp visible', () => {
    const page = render([{ ...loadedSource(), fromFallback: true }])

    expect(page.textContent).toContain('Last checked 4 minutes ago')
    expect(page.textContent).toContain('Showing the last published snapshot.')
  })

  it('explains an empty or unreachable source, and shows a switch for several', () => {
    const empty: SourceStatus = {
      source: { label: 'United States', url: 'us.json', format: 'json' },
      state: 'empty',
      document: undefined,
    }
    const offline: SourceStatus = { ...empty, state: 'unreachable' }

    expect(render([empty]).textContent).toContain(
      'Nothing has been published here yet.',
    )
    expect(render([offline]).textContent).toContain(
      "This page couldn't load the latest status.",
    )

    const buttons = render([loadedSource(), empty]).querySelectorAll('button')

    expect([...buttons].map(button => button.textContent)).toEqual([
      'Acme, down',
      'United States, no status yet',
    ])
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true')
  })

  it('never puts document text into the page as HTML', () => {
    const status = loadedSource()
    const record = status.document?.targets.website

    if (record) {
      record.label = '<img src=x onerror=alert(1)>'
    }

    const page = render([status])

    expect(page.querySelector('img')).toBeNull()
    expect(page.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('page helpers', () => {
  it('summarises 90 days and never rounds a failure up to 100%', () => {
    const record = loadedSource().document?.targets.website

    if (!record) {
      throw new Error('The test source has no website.')
    }

    record.days['2026-10-03'] = {
      checks: 100_000,
      failures: 1,
      latencyTotalMilliseconds: 100_000,
      latencyMaxMilliseconds: 9,
    }
    record.days['2026-01-01'] = {
      checks: 5,
      failures: 5,
      latencyTotalMilliseconds: 0,
      latencyMaxMilliseconds: 0,
    }

    const summary = summariseTarget(record, NOW)

    expect(summary.days).toHaveLength(90)
    expect(summary.days.at(-1)?.key).toBe('2026-10-04')
    expect(formatUptime(summary.uptimePercent)).toBe('99.99%')
    expect(formatUptime(100)).toBe('100%')
  })

  it('orders groups by the config, then alphabetically', () => {
    expect(
      orderGroups(['Zeta', 'Public', 'Alpha', 'Public'], ['Public']),
    ).toEqual(['Public', 'Alpha', 'Zeta'])
  })

  it('formats times in plain words', () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('just now')
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 minute ago')
    expect(formatRelativeTime(NOW - 3 * MILLISECONDS_PER_DAY, NOW)).toBe(
      '3 days ago',
    )
    expect(formatDuration(130 * 60_000)).toBe('2 h 10 min')
    expect(formatDuration(60 * 60_000)).toBe('1 h')
  })

  it('reports no status for a source with no targets', () => {
    expect(
      deriveOverallStatus(
        {
          source: { label: 'Acme', url: 'status.json', format: 'json' },
          state: 'loaded',
          document: {
            updatedAt: NOW,
            intervalMinutes: 5,
            checkedFrom: '',
            targets: {},
            incidents: [],
          },
        },
        NOW,
      ),
    ).toBe('unknown')
  })
})
