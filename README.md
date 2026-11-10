# fcr-to-opex

Convert a `dams-*-metadata` repo (metadata synced from its GCS binary archive)
into a Preservica OPEX/PAX package, ready for manual upload via Preservica's
web UI - no Preservica API call involved.

This tool ports the `package` command from the sibling tool
[`preservica-etl`](https://github.com/ucd-library/preservica-etl) as the first
step of migrating all current `digital.ucdavis.edu` collections (today backed
by Fedora Commons Repository / fcrepo) into Preservica. Only `package` (plus a
small `login` helper for GCS auth) is implemented so far - other commands may
be ported later as needed.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `FCR_TO_OPEX_GITHUB_ORG` - defaults to `ucd-library`, the GitHub org the
  `dams-*-metadata` repos live under.
- `FCR_TO_OPEX_GCS_BUCKET` - defaults to `dams-collections-binary-backups`,
  the production binary-archive bucket.
- `GOOGLE_APPLICATION_CREDENTIALS` - path to a GCS service-account JSON key.
  Resolved automatically via standard Google Application Default Credentials;
  there's no custom auth code to configure beyond this env var.

A `git` binary must be on `PATH` - cloning shells out to the system `git`
rather than using a Node git library. A `gcloud` binary must be on `PATH` too,
if you'll use `fcr-to-opex login` (see below) instead of a service-account key.

### GCS auth gotcha: `gcloud auth login` vs. Application Default Credentials

If `GOOGLE_APPLICATION_CREDENTIALS` is unset, `package`'s GCS binary sync
authenticates via your **Application Default Credentials** (ADC) -
`~/.config/gcloud/application_default_credentials.json`, set by
`gcloud auth application-default login`. This is a **separate login** from
`gcloud auth login`/the account `gcloud config list` shows as active - it's
easy to have a stale or wrong-account ADC file (e.g. from logging into a
different project long ago) even when the `gcloud` CLI itself looks correctly
configured. The symptom is a confusing `does not have storage.objects.list
access` error that doesn't match the account you'd expect.

Run `fcr-to-opex login` to fix this - it just runs
`gcloud auth application-default login` for you (an interactive browser-login
flow), under a clearer name so it's obvious this is the login `package`
actually needs, not the one `gcloud auth login` already set up.

## Usage

```bash
fcr-to-opex package --working-dir ./work --output-dir ./haeger-opex --slug haeger
```

Every run always shallow-clones `https://github.com/<org>/dams-<slug>-metadata.git`
(`main`, depth 1) fresh into `<working-dir>/dams-<slug>-metadata` - there's no
need to clone the metadata repo yourself first. Any existing checkout at that
path is removed and re-cloned, so treat `--working-dir` as a scratch directory
owned by this tool, not somewhere you keep other work.

| Flag | Default | Meaning |
|---|---|---|
| `-w, --working-dir <dir>` | *(required)* | directory to clone `dams-<slug>-metadata` into |
| `-o, --output-dir <dir>` | *(required)* | OPEX tree + zip output location |
| `-s, --slug <slug>` | *(required)* | collection slug - used for the GitHub repo name, the GCS binary prefix, and the output root folder name |
| `--github-org <org>` | `FCR_TO_OPEX_GITHUB_ORG` env var | override the GitHub org per-invocation |
| `--gcs-bucket <bucket>` | `FCR_TO_OPEX_GCS_BUCKET` env var | override the bucket per-invocation |
| `--skip-gcs-sync` | `false` | skip the GCS download step (inspect the raw metadata-only checkout) |
| `--force-gcs-sync` | `false` | re-download every binary even if already present locally |
| `-l, --limit <n>` | *(none)* | build a small TEST package: only the first `n` items (sorted order) are synced from GCS and packaged |

This produces `<output-dir>/<slug>/` (an OPEX-structured folder tree - real
Preservica folders and assets mirroring the source file tree, each with a
`.opex` sidecar) and `<output-dir>/<slug>.zip`. Upload the zip through
Preservica's web ingest/upload screen (drag-and-drop, no API call, no desktop
tooling) into whatever destination folder you choose. See "Package: schema.org
→ OPEX + Dublin Core" and "Compound items → PAX" below for exactly what gets
carried over and how.

## GCS binary sync

Production `dams-*-metadata` GitHub repos are `.gitignore`'d down to only
`*.jsonld.json`/`.md`/directory-skeleton files - the actual binary bytes
(tif/pdf/jpg/etc.) live in GCS instead, synced onto the freshly-cloned
checkout before packaging. There is **no** per-item GCS path field anywhere in
the JSON-LD; the object key is purely structural:

```
gs://<bucket>/<slug>/<same-relative-path-as-the-metadata-repo-tree-but-without-the-.jsonld.json-suffix>
```

e.g. `items/D-612_48_2_003/D-612_48_2_003.tif.jsonld.json` pairs with
`gs://dams-collections-binary-backups/robinson/items/D-612_48_2_003/D-612_48_2_003.tif`.
This mirrors the same convention used by production's own `collection-import`
job (`gsutil rsync`).

`lib/gcs-sync.js` lists every object under `gs://<bucket>/<slug>/` and
downloads it onto the local checkout at the matching relative path, rather
than pre-enumerating expected filenames from the JSON-LD tree - that avoids
re-implementing `lib/package/walk.js`'s own content-discovery rules a second
time, and is safe to over-download (`walk.js` only ever reads a file its own
sibling-path check already found). Use `--skip-gcs-sync` to inspect just the
metadata-only checkout (no binaries), and `--force-gcs-sync` to re-pull
everything regardless of what's already local.

## Building a small test package (`--limit`)

A full collection can mean gigabytes of binaries and hundreds of items -
slow to iterate on when you just want to sanity-check the OPEX/PAX output.
`--limit <n>` caps both steps to the same first `n` items, in sorted order
(`lib/package/walk.js#listItemNames`): GCS sync only downloads binaries for
those items (each selected item's content is still synced **in full** - every
page/representation - only the *number of items* is capped, not files within
one), and `package` only writes those items into the OPEX tree. A warning is
logged at the start of the run and again at each step (clone/sync/package) so
a limited run is never mistaken for a full export.

```bash
fcr-to-opex package --working-dir ./work --output-dir ./haeger-opex --slug haeger --limit 2
```

## Package: schema.org → OPEX + Dublin Core

Above the item level (the collection folder, and any grouping folder within
it), `package` classifies every node the same way:
- **Container** (`<name>.jsonld.json` + sibling dir `<name>/`) → a Preservica
  folder, `Title` = the directory's exact basename (functional, not cosmetic -
  see `lib/package/opex.js`).
- Anything else (e.g. a `labels.jsonld.json`-style file with no sibling dir or
  binary) is **skipped and logged**, not represented in the package.

Every `items/<item>.jsonld.json` becomes exactly **one** Preservica object -
never a wrapping folder - placed directly under the collection folder: a plain
leaf-file asset (with a SHA-1 fixity) if it resolves to a single file, or a PAX
complex asset (see "Compound items → PAX" below) if it resolves to more than
one.

Only nodes whose source JSON has descriptive fields get a Dublin Core
`oai_dc:dc` fragment attached (in practice: the collection and each item -
purely structural nodes like a `media`/`images` container or a per-page
technical record get none, since their filenames/MIME types are already
captured natively once the real file is uploaded). `oai_dc` is one of the
schemas Preservica speaks natively (its own OAI-PMH endpoint always supports
it), so no custom metadata template should be needed for it to show up as
real, editable metadata in the Preservica UI.

| schema.org | Dublin Core | Notes |
|---|---|---|
| `schema:name` | `dc:title` | |
| `schema:description` | `dc:description` | verbatim, markdown and all |
| `schema:creator` | `dc:creator` | |
| `schema:datePublished` | `dc:date` | unwrapped to a plain string |
| `schema:license` (`{"@id": uri}`) | `dc:rights` | the URI as text |
| `schema:about` (array of `{"@id": uri}`) | `dc:subject` (repeated) | the URI as text, not a resolved label |
| `schema:publisher`/`sdPublisher` | `dc:publisher` | first plain-string entry; the LOC `@id` entry is dropped |
| `schema:identifier` (ark + local id) | *not Dublin Core* | goes into OPEX `Properties/Identifiers` instead - Preservica's native identifier store |

## Compound items → PAX

A `dams-*-metadata` item with multiple files (e.g. `dams-haeger-metadata`'s
scanned documents: a PDF + a page-by-page TIFF sequence + a text transcript)
does **not** become a folder of independent, unrelated Preservica assets -
that would lose the fact that the pages belong to one document, and Preservica
would have no way to render it as a paginated item. Instead it becomes one
**PAX** (Preservation Asset eXchange) complex asset: one Preservica object with
multiple content objects, grouped into representations
(`Representation_<Type>/<content-object-name>/<file>`, per `lib/package/pax.js`).
Preservica's own docs name scanned books as PAX's canonical use case and state
it has a multi-page book viewer for rendering exactly this asset shape.

Bucketing heuristic (`lib/pax-representations.js`):

| Source location | Representation |
|---|---|
| A bare file directly in `media/` | `Access` |
| `media/images/` | `Preservation` |
| `media/text/` or any other named sub-folder | `Access` |

**Important constraint**: Preservica's PAX folder-naming shortcut only
recognizes exactly two representation types, `Preservation` and `Access` -
confirmed the hard way during `preservica-etl`'s own development, where a
third invented type name (`Representation_Text`) produced a real ingest
validation error ("Representation null: type is empty or invalid"). So
`media/text/` content folds into `Access` too, not a separate `Text` type.

Content-object order within a representation is **alphanumeric by folder
name** (Preservica's own documented ordering rule - no separate sequence field
needed), so the existing zero-padded `page_NNN.tif` naming is what keeps pages
in order.

## Testing

```bash
npm test
```

Unit tests cover the pure/deterministic logic (OPEX/PAX XML builders, Dublin
Core field extraction/rendering, identifier resolution, the PAX
representation-type mapping, cache round-trips, config env overrides, a
fixture-based integration test for the package walker, and the GCS sync
module with injected fakes) - no network access required. The thin GCS client
wrapper (`lib/gcs-client.js`), the git clone step (`lib/git-clone.js`), and
full command orchestration are covered by the manual smoke test below
instead, consistent with keeping network-heavy code out of the unit suite.

## Manual smoke test

**Metadata only (no GCS credentials needed):**
```bash
fcr-to-opex package --working-dir ./work --output-dir ./haeger-opex --slug haeger --skip-gcs-sync
# confirm ./work/dams-haeger-metadata was cloned fresh (main, depth 1)
# inspect ./haeger-opex/haeger/haeger.opex and a couple of nested .opex files by hand
```

**Full run against a real production collection:**
```bash
fcr-to-opex package --working-dir ./work --output-dir ./robinson-opex --slug robinson
# confirm binaries were downloaded under ./work/dams-robinson-metadata/items/**
# upload ./robinson-opex/robinson.zip via Preservica's web UI ingest/upload screen,
# then open an item in the UI to confirm the Dublin Core fields show up as real metadata
```
