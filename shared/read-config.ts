import { DEFAULT_INTERVAL_MINUTES, TARGET_DEFAULTS } from './constants.ts'
import { asObject } from './read-json.ts'
import type {
  JsonObject,
  JsonValue,
  SourceConfig,
  StatusConfig,
  TargetConfig,
} from './types.ts'

const TARGET_ID = /^[a-z0-9][a-z0-9-]*$/u
const DEFAULT_GROUP = 'Services'

const TOP_LEVEL_KEYS = new Set([
  '$schema',
  'title',
  'description',
  'groups',
  'intervalMinutes',
  'targets',
  'sources',
])

const TARGET_KEYS = new Set([
  'id',
  'label',
  'group',
  'url',
  'method',
  'expectedStatus',
  'contains',
  'timeoutMilliseconds',
  'slowAfterMilliseconds',
])

const SOURCE_KEYS = new Set(['label', 'url', 'fallbackUrl', 'format'])

/**
 * Collects every problem in the config, so one run of the build names all of
 * them instead of the first.
 */
class Problems {
  readonly list: string[] = []

  /**
   * Notes a problem.
   *
   * @param {string} problem What's wrong, and where.
   */
  add(problem: string): void {
    this.list.push(problem)
  }

  /**
   * Notes any keys that aren't allowed, which are usually typos.
   *
   * @param {JsonObject} source The object.
   * @param {ReadonlySet<string>} allowed The keys it may have.
   * @param {string} where Where the object is, such as "targets[2]".
   */
  unknownKeys(
    source: JsonObject,
    allowed: ReadonlySet<string>,
    where: string,
  ): void {
    for (const key of Object.keys(source)) {
      if (!allowed.has(key)) {
        this.add(`${where} has an unknown setting "${key}".`)
      }
    }
  }
}

/**
 * Reads a whole number setting within a range.
 *
 * @param {JsonValue | undefined} value The setting.
 * @param {number} fallback The default when it's missing.
 * @param {[number, number]} range The lowest and highest allowed values.
 * @param {string} where Where the setting is.
 * @param {Problems} problems The problems so far.
 * @returns {number} The value.
 */
function readWholeNumber(
  value: JsonValue | undefined,
  fallback: number,
  range: readonly [number, number],
  where: string,
  problems: Problems,
): number {
  if (value === undefined) {
    return fallback
  }

  const [lowest, highest] = range

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < lowest ||
    value > highest
  ) {
    problems.add(
      `${where} has to be a whole number from ${String(lowest)} to ${String(highest)}.`,
    )
    return fallback
  }

  return value
}

/**
 * Reads a text setting.
 *
 * @param {JsonValue | undefined} value The setting.
 * @param {string} where Where the setting is.
 * @param {Problems} problems The problems so far.
 * @param {boolean} required Whether it has to have text in it.
 * @returns {string} The text, trimmed.
 */
function readText(
  value: JsonValue | undefined,
  where: string,
  problems: Problems,
  required = false,
): string {
  if (value === undefined && !required) {
    return ''
  }

  if (typeof value !== 'string' || (required && value.trim() === '')) {
    problems.add(`${where} has to be ${required ? 'some text' : 'text'}.`)
    return ''
  }

  return value.trim()
}

/**
 * Checks that a URL is a full http or https address.
 *
 * @param {string} url The URL.
 * @returns {boolean} Whether it is one.
 */
function isWebAddress(url: string): boolean {
  if (!URL.canParse(url)) {
    return false
  }

  const { protocol } = new URL(url)
  return protocol === 'http:' || protocol === 'https:'
}

/**
 * Checks for an HTTP status code.
 *
 * @param {JsonValue} value The value.
 * @returns {boolean} Whether it's a whole number from 100 to 599.
 */
function isStatusCode(value: JsonValue): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 100 &&
    value <= 599
  )
}

/**
 * Reads the status codes a target has to answer with.
 *
 * @param {JsonValue | undefined} value A code, a list of codes, or nothing.
 * @param {string} where Where the setting is.
 * @param {Problems} problems The problems so far.
 * @returns {number[]} The codes, or an empty list for any 2xx or 3xx code.
 */
function readExpectedStatus(
  value: JsonValue | undefined,
  where: string,
  problems: Problems,
): number[] {
  if (value === undefined) {
    return []
  }

  const codes = Array.isArray(value) ? value : [value]
  const valid = codes.filter(code => isStatusCode(code))

  if (valid.length !== codes.length || codes.length === 0) {
    problems.add(
      `${where}.expectedStatus has to be a status code, such as 200, or a list of them.`,
    )
  }

  return valid
}

/**
 * Reads one target.
 *
 * @param {JsonValue} value The target.
 * @param {number} index Its position in the list.
 * @param {Problems} problems The problems so far.
 * @returns {TargetConfig | undefined} The target, or undefined when it isn't an object.
 */
function readTarget(
  value: JsonValue,
  index: number,
  problems: Problems,
): TargetConfig | undefined {
  const where = `targets[${String(index)}]`
  const source = asObject(value)

  if (!source) {
    problems.add(`${where} has to be an object.`)
    return undefined
  }

  problems.unknownKeys(source, TARGET_KEYS, where)

  const id = readText(source.id, `${where}.id`, problems, true)
  const url = readText(source.url, `${where}.url`, problems, true)
  const method = source.method ?? 'GET'
  const contains = readText(source.contains, `${where}.contains`, problems)

  if (id !== '' && !TARGET_ID.test(id)) {
    problems.add(
      `${where}.id "${id}" can only have lowercase letters, numbers and hyphens.`,
    )
  }

  if (url !== '' && !isWebAddress(url)) {
    problems.add(`${where}.url has to start with http:// or https://.`)
  }

  if (method !== 'GET' && method !== 'HEAD') {
    problems.add(`${where}.method has to be "GET" or "HEAD".`)
  }

  if (method === 'HEAD' && contains !== '') {
    problems.add(
      `${where} can't check for text with "HEAD", because a HEAD response has no body.`,
    )
  }

  return {
    id,
    label: readText(source.label, `${where}.label`, problems) || id,
    group: readText(source.group, `${where}.group`, problems) || DEFAULT_GROUP,
    url,
    method: method === 'HEAD' ? 'HEAD' : 'GET',
    expectedStatus: readExpectedStatus(source.expectedStatus, where, problems),
    contains,
    timeoutMilliseconds: readWholeNumber(
      source.timeoutMilliseconds,
      TARGET_DEFAULTS.timeoutMilliseconds,
      [1000, 60_000],
      `${where}.timeoutMilliseconds`,
      problems,
    ),
    slowAfterMilliseconds: readWholeNumber(
      source.slowAfterMilliseconds,
      TARGET_DEFAULTS.slowAfterMilliseconds,
      [0, 60_000],
      `${where}.slowAfterMilliseconds`,
      problems,
    ),
  }
}

/**
 * Reads one source the page reads a document from.
 *
 * @param {JsonValue} value The source.
 * @param {number} index Its position in the list.
 * @param {Problems} problems The problems so far.
 * @returns {SourceConfig | undefined} The source, or undefined when it isn't an object.
 */
function readSource(
  value: JsonValue,
  index: number,
  problems: Problems,
): SourceConfig | undefined {
  const where = `sources[${String(index)}]`
  const source = asObject(value)

  if (!source) {
    problems.add(`${where} has to be an object.`)
    return undefined
  }

  problems.unknownKeys(source, SOURCE_KEYS, where)

  const format = source.format ?? 'json'
  const fallbackUrl = readText(
    source.fallbackUrl,
    `${where}.fallbackUrl`,
    problems,
    source.fallbackUrl !== undefined,
  )

  if (format !== 'json' && format !== 'firestore') {
    problems.add(`${where}.format has to be "json" or "firestore".`)
  }

  return {
    label: readText(source.label, `${where}.label`, problems, true),
    url: readText(source.url, `${where}.url`, problems, true),
    ...(fallbackUrl !== '' && { fallbackUrl }),
    format: format === 'firestore' ? 'firestore' : 'json',
  }
}

/**
 * Reads a list setting.
 *
 * @param {JsonValue | undefined} value The setting.
 * @param {string} where Where the setting is.
 * @param {Problems} problems The problems so far.
 * @returns {JsonValue[]} The list, or an empty one.
 */
function readList(
  value: JsonValue | undefined,
  where: string,
  problems: Problems,
): JsonValue[] {
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value)) {
    problems.add(`${where} has to be a list.`)
    return []
  }

  return value
}

/**
 * Reads status.config.json and fills in defaults. Every problem is reported
 * at once, with where it is, so the build fails with a clear list instead of
 * publishing a broken page.
 *
 * @param {string} text The file's contents.
 * @returns {StatusConfig} The config.
 */
function readConfig(text: string): StatusConfig {
  let parsed: JsonValue

  try {
    parsed = JSON.parse(text) as JsonValue
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`status.config.json isn't valid JSON: ${reason}`, {
      cause: error,
    })
  }

  const source = asObject(parsed)

  if (!source) {
    throw new Error('status.config.json has to be a JSON object.')
  }

  const problems = new Problems()

  problems.unknownKeys(source, TOP_LEVEL_KEYS, 'status.config.json')

  const targets = readList(source.targets, 'targets', problems)
    .map((value, index) => readTarget(value, index, problems))
    .filter(target => target !== undefined)
  const sources = readList(source.sources, 'sources', problems)
    .map((value, index) => readSource(value, index, problems))
    .filter(entry => entry !== undefined)
  const groups = readList(source.groups, 'groups', problems).filter(
    group => typeof group === 'string',
  )
  const seen = new Set<string>()

  for (const target of targets) {
    if (target.id !== '' && seen.has(target.id)) {
      problems.add(`Two targets have the id "${target.id}".`)
    }

    seen.add(target.id)
  }

  if (targets.length === 0 && sources.length === 0) {
    problems.add('Add at least one target to check, or a source to read.')
  }

  const config: StatusConfig = {
    title: readText(source.title, 'title', problems, true),
    description: readText(source.description, 'description', problems),
    groups,
    intervalMinutes: readWholeNumber(
      source.intervalMinutes,
      DEFAULT_INTERVAL_MINUTES,
      [1, 1440],
      'intervalMinutes',
      problems,
    ),
    targets,
    sources,
  }

  if (problems.list.length > 0) {
    throw new Error(
      `status.config.json has problems:\n${problems.list.map(problem => `- ${problem}`).join('\n')}`,
    )
  }

  return config
}

export { readConfig }
