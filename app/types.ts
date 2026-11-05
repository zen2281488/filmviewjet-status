import type {
  SourceConfig,
  StatusDocument,
  TargetRecord,
} from '../shared/types.ts'

/**
 * How loading a source is going. "empty" means nothing has been published
 * there yet, and "unreachable" means the request failed.
 */
type LoadState = 'loading' | 'loaded' | 'empty' | 'unreachable'

interface SourceStatus {
  source: SourceConfig
  state: LoadState
  document: StatusDocument | undefined
  fromFallback?: boolean
}

/**
 * The headline state of a whole source. "stale" means its monitor stopped
 * reporting, so the page can't vouch for anything.
 */
type OverallStatus = 'operational' | 'degraded' | 'down' | 'stale' | 'unknown'

/**
 * One day on a target's 90 day bar. Averages are 0 on a day with no checks.
 */
interface DaySummary {
  key: string
  checks: number
  failures: number
  uptimePercent: number
  latencyAverageMilliseconds: number
  latencyMaxMilliseconds: number
}

interface TargetSummary {
  record: TargetRecord
  uptimePercent: number
  days: DaySummary[]
  /**
   * The slowest daily average on the bar, which sets the bars' heights.
   */
  latencyCeilingMilliseconds: number
}

export type {
  DaySummary,
  LoadState,
  OverallStatus,
  SourceStatus,
  TargetSummary,
}
