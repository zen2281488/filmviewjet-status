import { readdir, readFile } from 'node:fs/promises'
import { readConfig } from '../shared/read-config.ts'
import type { JsonValue } from '../shared/types.ts'
import { isPublicDocument } from './public-status.ts'

const config = readConfig(await readFile('status.config.json', 'utf8'))
const [target] = config.targets
if (
  target?.id !== 'api' ||
  config.targets.length !== 1 ||
  config.sources.length > 0
) {
  throw new Error('The public Pages config must contain only the API check')
}

const files = await readdir('site', { withFileTypes: true })
if (
  files.some(file =>
    file.name === 'assets'
      ? !file.isDirectory()
      : !file.isFile() || !['index.html', 'status.json'].includes(file.name),
  )
) {
  throw new Error('Unexpected file in the public Pages artifact')
}

const assets = await readdir('site/assets', { withFileTypes: true })
if (
  assets.some(
    file => !file.isFile() || !/^[\w-]+\.(?:css|js|woff2)$/u.test(file.name),
  )
) {
  throw new Error('Unexpected asset in the public Pages artifact')
}

await readFile('site/index.html')
const snapshot = JSON.parse(
  await readFile('site/status.json', 'utf8'),
) as JsonValue
if (!isPublicDocument(snapshot, target)) {
  throw new Error(
    'The Pages snapshot contains fields outside the public API history',
  )
}

console.info('Verified public API history and static assets for GitHub Pages.')
