# Status Page

This FilmViewJet fallback monitors the public API and keeps its 90-day uptime.
The [main status page](https://93-113-171-2.sslip.io/filmview-status/) is hosted
separately. The Pages workflow publishes only the API history and static
assets. Both the scheduled and heartbeat runs use the same publication check.

The notes below describe the upstream QuickCasa template.

[![CI](https://github.com/QuickCasa/status-page/actions/workflows/ci.yml/badge.svg)](https://github.com/QuickCasa/status-page/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A free, open source status page that runs entirely on GitHub. A scheduled
GitHub Actions workflow checks your sites about every five minutes and
publishes a status page to GitHub Pages, with 90 days of history and the
incidents from the last 30. There's no server, no database and no account to
sign up for.

**[See it live](https://quickcasa.github.io/status-page/)**, watching
QuickCasa's own open source tools.

## Set up your own

1. Click **Use this template** at the top of this repository, and create a
   **public** repository. GitHub Pages needs a paid plan for private
   repositories, and Actions are free for public ones.
2. In your new repository, open **Settings**, then **Pages**, and set
   **Source** to **GitHub Actions**.
3. Edit `status.config.json`: give the page a title and list what to check.
4. Commit the change. The push runs the workflow, which checks everything and
   publishes the page at `https://<your-account>.github.io/<repository>/`.
   From then on it runs on its own.

To use your own domain, add it under **Settings**, then **Pages**, then
**Custom domain**.

## The config

```json
{
  "$schema": "./status.config.schema.json",
  "title": "Acme status",
  "description": "Live status for Acme's website and API.",
  "groups": ["Website", "API"],
  "targets": [
    {
      "id": "website",
      "label": "Website",
      "group": "Website",
      "url": "https://acme.example/"
    },
    {
      "id": "api",
      "label": "Public API",
      "group": "API",
      "url": "https://api.acme.example/health",
      "contains": "\"ok\":true",
      "slowAfterMilliseconds": 1500
    }
  ]
}
```

| Setting           | What it does                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `title`           | The page's heading and browser tab title. Required.                                                                         |
| `description`     | A sentence under the heading, also used as the page's description for search engines.                                       |
| `groups`          | The order sections appear in. Groups not listed come after, in alphabetical order.                                          |
| `intervalMinutes` | How often checks run. Defaults to 5. Keep it in step with the schedule in `.github/workflows/status.yml`.                   |
| `targets`         | What to check. See below.                                                                                                   |
| `sources`         | Status documents from somewhere else to show instead. See [Showing another monitor's data](#showing-another-monitors-data). |

Each target has:

| Setting                 | What it does                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`                    | A short, permanent name: lowercase letters, numbers and hyphens. Changing it starts the target's history over. |
| `label`                 | The name on the page. Defaults to the id.                                                                      |
| `group`                 | The section it appears in. Defaults to "Services".                                                             |
| `url`                   | The address to request.                                                                                        |
| `method`                | `GET` (the default) or `HEAD`.                                                                                 |
| `expectedStatus`        | A status code, or a list of them, that counts as up. Without it, any 2xx or 3xx code does.                     |
| `contains`              | Text the response has to contain to count as up. Needs `GET`.                                                  |
| `timeoutMilliseconds`   | How long to wait before the target counts as down. Defaults to 10000.                                          |
| `slowAfterMilliseconds` | An answer slower than this counts as slow. Defaults to 3000.                                                   |

`status.config.schema.json` describes every setting, so editors such as VS
Code check the config and suggest settings as you type. A config with a
mistake fails the build with a list of every problem, and the last published
page stays up.

## How it works

Every five minutes the workflow in `.github/workflows/status.yml` builds the
page and runs `npm run monitor`, which:

1. reads `status.config.json`,
2. downloads the `status.json` the last run published, which holds the
   history,
3. requests every target at once, following redirects, and tries a failed one
   once more after two seconds,
4. adds the results to the history and writes `status.json` beside the page,

and then the workflow publishes both to GitHub Pages.

A target is **up** when it answers with an expected status code and contains
any expected text, **slow** when it takes longer than its limit, and **down**
when it fails twice in a row in the same run. An incident opens when a target
goes down and closes when it's back.

The published `status.json` is the only place the history is kept, so nothing
is committed to the repository for each check. The page reloads it every
minute. If no new check arrives for 30 minutes, the page says the checks are
delayed instead of showing an old green light.

## Limits worth knowing

- **Checks can be late.** GitHub runs scheduled workflows when it can. Runs
  can start late, especially near the top of the hour, and GitHub drops some
  when it's busy. The page always says when the last check ran.
- **Checks run from GitHub's servers**, so they show whether your sites answer
  there, not from everywhere.
- **No alerts.** The page shows problems, but doesn't email or message anyone.
- **Your target URLs are public** in a public repository, because they're in
  `status.config.json`. They're never shown on the page or written to
  `status.json`, but don't put anything secret in them.
- **GitHub turns off scheduled workflows** in a public repository after 60
  days with no activity. The workflow makes an empty commit after 50 quiet days
  to prevent that. If the checks stop anyway, open **Actions**, pick the
  workflow and click **Enable workflow**.

## Showing another monitor's data

The page can show status documents from anywhere instead of, or as well as,
its own. Each source gets a tab:

```json
{
  "title": "Acme status",
  "sources": [
    { "label": "Canada", "url": "https://status-ca.acme.example/status.json" },
    {
      "label": "United States",
      "url": "https://firestore.googleapis.com/v1/projects/acme-us/databases/(default)/documents/status/current",
      "format": "firestore"
    }
  ]
}
```

A source's address has to allow cross-origin requests. `"format": "firestore"`
reads a document from the Firestore REST API, which a publicly readable
Firestore document allows. To keep this repository's own checks as a tab too,
add a source with the address `status.json`.

A status document looks like this, with times in milliseconds since 1970 and
days in UTC:

```json
{
  "updatedAt": 1791072000000,
  "intervalMinutes": 5,
  "checkedFrom": "GitHub Actions",
  "targets": {
    "website": {
      "id": "website",
      "label": "Website",
      "group": "Website",
      "status": "operational",
      "lastCheckedAt": 1791072000000,
      "lastLatencyMilliseconds": 182,
      "lastStatusCode": 200,
      "lastError": "",
      "consecutiveFailures": 0,
      "days": {
        "2026-10-04": {
          "checks": 288,
          "failures": 0,
          "latencyTotalMilliseconds": 52416,
          "latencyMaxMilliseconds": 950
        }
      }
    }
  },
  "incidents": [
    {
      "id": "website-1791060000000",
      "targetId": "website",
      "targetLabel": "Website",
      "startedAt": 1791060000000,
      "endedAt": 1791060600000,
      "statusCode": 503,
      "error": "HTTP 503"
    }
  ]
}
```

`status` is `operational`, `degraded` or `down`, and an incident that's still
going on has an `endedAt` of 0. Missing fields are filled with empty values
and extra fields are ignored, so a document from another monitor only needs
`targets`.

## Development

You need Node.js 22.18 or later, which runs the monitor's TypeScript directly.

```bash
npm install
npm run dev       # serves the page with live reload; add ?sample to the address for made-up data
npm run check     # format, typecheck, tests, lint and build
npm run build && npm run monitor && npm run preview   # the real page with real checks
```

The page is plain TypeScript with no framework, in `app/`. The monitor is in
`monitor/`, and the code both use, such as the config reader and the status
document's types, is in `shared/`. Neither the page nor the monitor has any
runtime dependencies.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Licence

[MIT](LICENSE). Built and maintained by [QuickCasa](https://quickcasa.ai) in
Kitchener, Ontario.
