import { formatRelativeTime } from '../format.ts'
import type { OverallStatus, SourceStatus } from '../types.ts'
import { createElement } from './create-element.ts'

const HEADLINES: Readonly<Record<OverallStatus, string>> = {
  operational: 'All systems operational',
  degraded: 'Some systems are slow',
  down: 'Some systems are down',
  stale: 'Status checks are delayed',
  unknown: 'No status yet',
}

/**
 * The line under the headline: when the last check ran, from where, and how
 * often checks run. It stays on the page whatever the state, so nobody has to
 * guess how fresh the headline is.
 *
 * @param {SourceStatus} status The source on screen.
 * @param {OverallStatus} overall Its headline state.
 * @param {number} now The current time.
 * @returns {string} The line.
 */
function describeFreshness(
  status: SourceStatus,
  overall: OverallStatus,
  now: number,
): string {
  if (status.state === 'loading') {
    return 'Waiting for the latest check results.'
  }

  if (status.state === 'unreachable') {
    return "This page couldn't load the latest status. It tries again every minute."
  }

  if (!status.document || overall === 'unknown') {
    return 'Nothing has been published here yet. The first checks appear a few minutes after the page is set up.'
  }

  const { checkedFrom, intervalMinutes, updatedAt } = status.document
  const from = checkedFrom === '' ? '' : ` from ${checkedFrom}`
  const cadence =
    intervalMinutes > 0
      ? ` Checks run about every ${String(intervalMinutes)} minutes.`
      : ''
  const snapshot = status.fromFallback
    ? ' Showing the last published snapshot.'
    : ''

  return `Last checked ${formatRelativeTime(updatedAt, now)}${from}.${cadence}${snapshot}`
}

/**
 * Draws the headline block: one state for the whole source, and how fresh
 * it is.
 *
 * @param {SourceStatus} status The source on screen.
 * @param {OverallStatus} overall Its headline state.
 * @param {number} now The current time.
 * @returns {HTMLElement} The block.
 */
function renderBanner(
  status: SourceStatus,
  overall: OverallStatus,
  now: number,
): HTMLElement {
  const banner = createElement('section', `banner banner--${overall}`)
  const text = createElement('div', 'banner__text')

  text.append(
    createElement(
      'h2',
      'banner__headline',
      status.state === 'loading' ? 'Loading status' : HEADLINES[overall],
    ),
    createElement(
      'p',
      'banner__detail',
      describeFreshness(status, overall, now),
    ),
  )
  banner.append(createElement('span', 'banner__dot'), text)
  banner.firstElementChild?.setAttribute('aria-hidden', 'true')

  return banner
}

export { renderBanner }
