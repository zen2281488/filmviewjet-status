import { describe, expect, it } from 'vitest'
import { readConfig } from '../shared/read-config.ts'

describe('readConfig', () => {
  it('fills in defaults for a minimal config', () => {
    const config = readConfig(
      JSON.stringify({
        title: 'Acme status',
        targets: [{ id: 'website', url: 'https://example.com/' }],
      }),
    )

    expect(config).toEqual({
      title: 'Acme status',
      description: '',
      groups: [],
      intervalMinutes: 5,
      sources: [],
      targets: [
        {
          id: 'website',
          label: 'website',
          group: 'Services',
          url: 'https://example.com/',
          method: 'GET',
          expectedStatus: [],
          contains: '',
          timeoutMilliseconds: 10_000,
          slowAfterMilliseconds: 3000,
        },
      ],
    })
  })

  it('accepts one status code or a list, and a source in Firestore format', () => {
    const config = readConfig(
      JSON.stringify({
        title: 'Acme',
        targets: [
          { id: 'a', url: 'https://a.example', expectedStatus: 204 },
          { id: 'b', url: 'https://b.example', expectedStatus: [200, 401] },
        ],
        sources: [
          {
            label: 'Canada',
            url: 'https://firestore.googleapis.com/v1/projects/x/databases/(default)/documents/status/current',
            format: 'firestore',
          },
        ],
      }),
    )

    expect(config.targets.map(target => target.expectedStatus)).toEqual([
      [204],
      [200, 401],
    ])
    expect(config.sources[0]?.format).toBe('firestore')
  })

  it('accepts a relative backup URL for a source', () => {
    const config = readConfig(
      JSON.stringify({
        title: 'Acme',
        sources: [
          {
            label: 'Stand',
            url: 'https://stand.example/status.json',
            fallbackUrl: 'stand-status.json',
          },
        ],
      }),
    )

    expect(config.sources[0]).toEqual({
      label: 'Stand',
      url: 'https://stand.example/status.json',
      fallbackUrl: 'stand-status.json',
      format: 'json',
    })
  })

  it('lists every problem at once, with where each one is', () => {
    const attempt = (): void => {
      readConfig(
        JSON.stringify({
          title: '',
          colour: 'blue',
          targets: [
            { id: 'Website', url: 'ftp://example.com', contain: 'ok' },
            {
              id: 'api',
              url: 'https://example.com',
              method: 'HEAD',
              contains: 'ok',
            },
            { id: 'api', url: 'https://example.com', timeoutMilliseconds: 5 },
          ],
        }),
      )
    }

    expect(attempt).toThrow('title has to be some text.')
    expect(attempt).toThrow(
      'status.config.json has an unknown setting "colour".',
    )
    expect(attempt).toThrow('targets[0] has an unknown setting "contain".')
    expect(attempt).toThrow(
      'can only have lowercase letters, numbers and hyphens',
    )
    expect(attempt).toThrow(
      'targets[0].url has to start with http:// or https://.',
    )
    expect(attempt).toThrow('targets[1] can\'t check for text with "HEAD"')
    expect(attempt).toThrow('Two targets have the id "api".')
    expect(attempt).toThrow(
      'targets[2].timeoutMilliseconds has to be a whole number from 1000 to 60000.',
    )
  })

  it('needs something to show, and valid JSON', () => {
    expect(() => readConfig('{"title": "Empty"}')).toThrow(
      'Add at least one target to check, or a source to read.',
    )
    expect(() => readConfig('{ title: nope }')).toThrow(
      "status.config.json isn't valid JSON",
    )
  })
})
