import { mkdir, writeFile } from 'node:fs/promises'
import { normalizeDocument } from '../shared/normalize-document.ts'
import type { JsonValue } from '../shared/types.ts'

const source = 'https://filmview.85-172-39-153.sslip.io/status-data/status.json'

async function readDocument(url: string) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return
    }
    const body = (await response.json()) as JsonValue
    const status = normalizeDocument(body)
    if (status?.updatedAt && Object.keys(status.targets).length > 0) {
      return status
    }
  } catch {
    // The external page can still publish while the stand is unreachable.
  }
}

const live = await readDocument(source)
const base = process.env.STATUS_PAGE_URL
const previous =
  base && (await readDocument(`${base.replace(/\/$/u, '')}/stand-status.json`))
const snapshot =
  live && (!previous || live.updatedAt >= previous.updatedAt) ? live : previous

if (snapshot) {
  await mkdir('site', { recursive: true })
  await writeFile('site/stand-status.json', JSON.stringify(snapshot))
  console.info(
    snapshot === live
      ? 'Mirrored stand checks.'
      : 'Kept the last known stand checks.',
  )
} else {
  console.warn('No stand snapshot is available yet.')
}
