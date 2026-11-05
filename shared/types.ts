/**
 * A target's state at its last check. Degraded means it answered, but slower
 * than its limit.
 */
type TargetStatus = 'operational' | 'degraded' | 'down'

/**
 * One UTC day of checks for one target.
 */
interface DayBucket {
  checks: number
  failures: number
  latencyTotalMilliseconds: number
  latencyMaxMilliseconds: number
}

/**
 * A stretch of time a target was down. `endedAt` is 0 while it's still down.
 */
interface Incident {
  id: string
  targetId: string
  targetLabel: string
  startedAt: number
  endedAt: number
  statusCode: number
  error: string
}

interface TargetRecord {
  id: string
  label: string
  group: string
  status: TargetStatus
  lastCheckedAt: number
  lastLatencyMilliseconds: number
  lastStatusCode: number
  lastError: string
  consecutiveFailures: number
  /**
   * Keyed by UTC day, as YYYY-MM-DD.
   */
  days: Record<string, DayBucket>
}

/**
 * The status document: everything the page shows, in one JSON file. Times
 * are milliseconds since 1970.
 */
interface StatusDocument {
  updatedAt: number
  intervalMinutes: number
  /**
   * Where the checks run from, such as "GitHub Actions". Can be blank.
   */
  checkedFrom: string
  targets: Record<string, TargetRecord>
  incidents: Incident[]
}

/**
 * Something to check, from status.config.json.
 */
interface TargetConfig {
  id: string
  label: string
  group: string
  url: string
  method: 'GET' | 'HEAD'
  /**
   * The status codes that count as up. Empty means any 2xx or 3xx code.
   */
  expectedStatus: number[]
  /**
   * Text the response has to contain to count as up. Empty means no check.
   */
  contains: string
  timeoutMilliseconds: number
  slowAfterMilliseconds: number
}

/**
 * Where the page reads a status document from, when it isn't the one the
 * built-in monitor publishes.
 */
interface SourceConfig {
  label: string
  url: string
  fallbackUrl?: string
  /**
   * "firestore" reads a Firestore REST API document and unwraps its typed
   * fields.
   */
  format: 'json' | 'firestore'
}

/**
 * The whole of status.config.json, with defaults filled in.
 */
interface StatusConfig {
  title: string
  description: string
  groups: string[]
  intervalMinutes: number
  targets: TargetConfig[]
  sources: SourceConfig[]
}

/**
 * The part of the config the page needs. Target URLs stay out of the page.
 */
type PageConfig = Pick<
  StatusConfig,
  'description' | 'groups' | 'sources' | 'title'
>

/**
 * The outcome of checking one target once.
 */
interface CheckResult {
  targetId: string
  up: boolean
  slow: boolean
  latencyMilliseconds: number
  statusCode: number
  error: string
}

/**
 * Anything JSON.parse can return. Documents and config are read as this, then
 * checked field by field.
 */
type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

type JsonObject = { [key: string]: JsonValue }

export type {
  CheckResult,
  DayBucket,
  Incident,
  JsonObject,
  JsonValue,
  PageConfig,
  SourceConfig,
  StatusConfig,
  StatusDocument,
  TargetConfig,
  TargetRecord,
  TargetStatus,
}
