import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DOCUMENT_FILE } from '../shared/constants.ts'
import { readConfig } from '../shared/read-config.ts'
import { applyResults } from './apply-results.ts'
import { checkTarget } from './check-target.ts'
import { describeResult } from './describe-result.ts'
import { PUBLIC_CHECK_FAILURE, retainPublicHistory } from './public-status.ts'
import { readPreviousDocument } from './read-previous-document.ts'

// Runs one round of checks: read the config and the last published document,
// check every target, and write the updated document next to the built page.
// The workflow in .github/workflows/status.yml runs this every five minutes.

const OUTPUT_DIRECTORY = 'site'
const ON_GITHUB = process.env.GITHUB_ACTIONS === 'true'

/**
 * Prints a warning, which GitHub also shows on the workflow run's summary.
 *
 * @param {string} message The warning.
 */
function warn(message: string): void {
  console.warn(ON_GITHUB ? `::warning::${message}` : message)
}

/**
 * Checks every target once and writes the updated status document.
 *
 * @returns {Promise<void>} Resolves once the document is written.
 */
async function run(): Promise<void> {
  const config = readConfig(await readFile('status.config.json', 'utf8'))

  const [target] = config.targets
  if (
    target?.id !== 'api' ||
    config.targets.length !== 1 ||
    config.sources.length > 0
  ) {
    throw new Error('The public Pages config must contain only the API check')
  }

  const outputFile = path.join(OUTPUT_DIRECTORY, DOCUMENT_FILE)
  const previous = await readPreviousDocument(
    process.env.STATUS_PAGE_URL ?? '',
    outputFile,
    warn,
  )
  const now = Date.now()
  const result = await checkTarget(target)
  const publicResult = {
    ...result,
    error: result.up ? '' : PUBLIC_CHECK_FAILURE,
  }
  const statusDocument = applyResults(
    retainPublicHistory(previous, target),
    config,
    [publicResult],
    now,
    ON_GITHUB ? 'GitHub Actions' : '',
  )

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  await writeFile(outputFile, JSON.stringify(statusDocument))

  console.info(describeResult(target.label, publicResult))

  console.info(
    previous
      ? `Updated ${outputFile}.`
      : `Wrote ${outputFile} with no earlier history.`,
  )
}

await run()
