import { isDeepStrictEqual } from 'node:util'
import { normalizeDocument } from '../shared/normalize-document.ts'
import type {
  JsonValue,
  StatusDocument,
  TargetConfig,
} from '../shared/types.ts'

const PUBLIC_CHECK_FAILURE = 'Проверка публичного API не прошла.'

function publicError(error: string): string {
  return error === '' ? '' : PUBLIC_CHECK_FAILURE
}

/**
 * Keeps the API's history and removes private checks and legacy error text.
 * @param {StatusDocument | undefined} previous The previously published data.
 * @param {TargetConfig} target The public API target.
 * @returns {StatusDocument | undefined} The history safe to carry forward.
 */
function retainPublicHistory(
  previous: StatusDocument | undefined,
  target: TargetConfig,
): StatusDocument | undefined {
  const api = previous?.targets[target.id]
  if (!previous || !api) {
    return undefined
  }

  return {
    ...previous,
    checkedFrom: '',
    targets: {
      [target.id]: {
        ...api,
        id: target.id,
        label: target.label,
        group: target.group,
        lastError: publicError(api.lastError),
      },
    },
    incidents: previous.incidents
      .filter(incident => incident.targetId === target.id)
      .map(incident => ({
        ...incident,
        id: `${target.id}-${String(incident.startedAt)}`,
        targetLabel: target.label,
        error: publicError(incident.error),
      })),
  }
}

/**
 * Rejects raw or detailed data before it can become a Pages artifact.
 * @param {JsonValue | StatusDocument} value The generated document.
 * @param {TargetConfig} target The configured public API check.
 * @returns {boolean} Whether the payload matches the public boundary.
 */
function isPublicDocument(
  value: JsonValue | StatusDocument,
  target: TargetConfig,
): boolean {
  const normalized = normalizeDocument(value as JsonValue)
  if (!normalized || !isDeepStrictEqual(normalized, value)) {
    return false
  }
  if (
    normalized.checkedFrom !== 'GitHub Actions' &&
    normalized.checkedFrom !== ''
  ) {
    return false
  }

  const retained = retainPublicHistory(normalized, target)
  return (
    isDeepStrictEqual(normalized.targets, retained?.targets) &&
    isDeepStrictEqual(normalized.incidents, retained?.incidents)
  )
}

export { PUBLIC_CHECK_FAILURE, isPublicDocument, retainPublicHistory }
