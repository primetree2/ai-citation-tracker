# My normalized v3 schema

I use one run object for one saved response or conversation. I can download `public/examples/custom.json` as my starting point.

```json
{
  "schemaVersion": 3,
  "id": "my-run-001",
  "platform": "my-provider",
  "title": "My source review",
  "prompt": "How can I verify this answer?",
  "model": "my-model-label",
  "createdAt": "2025-06-15T12:00:00Z",
  "queries": ["source verification"],
  "sources": [
    {
      "url": "https://example.org/guide",
      "title": "My reference guide",
      "retrieved": true,
      "cited": true,
      "evidence": ["My explicitly mapped source field"]
    }
  ],
  "warnings": ["I mapped this run manually."],
  "synthetic": false
}
```

I require `schemaVersion: 3` and a `sources` array for normalized imports. I use real JSON booleans, not strings such as `"false"`. I provide `id`, `platform`, and a response timestamp whenever possible. I use ISO 8601 timestamps with an offset or `Z`; I leave a genuinely unavailable date null. I don’t substitute the import date for the response date.

I can leave `queries` empty if I cannot observe them. I don’t interpret an empty list as proof that no search happened. I attach evidence descriptions to manually mapped sources so I can remember where the flags came from.

## My evidence states

| My retrieved flag | My cited flag | My interpretation |
| --- | --- | --- |
| `true` | `true` | I observed retrieval evidence and citation evidence. |
| `true` | `false` | I observed retrieval evidence, but no citation evidence. |
| `false` | `true` | I observed citation evidence without a retrieval record. |
| `false` | `false` | I have a URL but no specified retrieval or citation evidence. |

I do not treat a false flag as proof that the provider never retrieved or cited a page. It means that evidence was not recorded in this normalized run.

## My URL rules

I accept HTTP and HTTPS only. I reject URLs with embedded usernames or passwords. I remove fragments, `utm_*`, `fbclid`, `gclid`, and `msclkid`, sort remaining query parameters, and remove a trailing slash from a URL with no remaining query string. I preserve path case, meaningful query parameters, HTTP versus HTTPS, and `www` in the actual URL. I strip `www` only for the displayed domain label.

I merge identical canonical URLs within one run, OR the evidence flags, and combine the evidence paths and reference IDs. I don’t merge sources across runs. I keep provider-supplied redirect URLs rather than making network calls to resolve them.

## My metrics

I calculate these values from current run filters:

- I count retrievals from `retrieved === true` URL/run pairs.
- I count cited sources from `cited === true` URL/run pairs.
- I count matched citations only when both flags are true.
- I calculate matched rate as matched citations divided by retrievals. I use null / a dash if retrievals are absent.
- I count uncited retrievals when retrieval is true and citation is false.
- I rank domains by cited URL/run pairs, not citation-marker frequency or traffic.

I don’t claim these fields expose hidden browsing behavior or make unlike provider logs directly comparable.

## My workspace envelope

```json
{
  "schemaVersion": 3,
  "runs": []
}
```

I export a `runs` array of normalized objects plus `exportedAt`. I can reimport a nonempty backup. I intentionally reject an empty import so I don’t mistake an empty file for a reset operation. I can still store an empty workspace using my explicit reset control.

## My CSV export

I export one row per source/run pair with run ID, provider, model, source title, canonical URL, domain, retrieval flag, citation flag, and evidence paths. I quote cells, double embedded quotes, and prefix formula-like cells with an apostrophe to reduce spreadsheet formula injection. I use UTF-8 with a BOM for Windows spreadsheet compatibility. I still review untrusted data before opening a spreadsheet.
