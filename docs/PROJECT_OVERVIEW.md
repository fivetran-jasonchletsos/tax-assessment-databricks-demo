# Allegheny County Tax Assessment Portal — Project Overview

> A reference build that demonstrates an end-to-end modern data stack
> — Fivetran → Databricks → dbt → React — using real Allegheny County
> property tax data. Designed as a Sales Engineer demo, deployed as a
> public-facing community portal.
>
> **Live site:** https://fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/
> **Repo:** https://github.com/fivetran-jasonchletsos/tax-assessment-databricks-demo
> **Audience:** Sales Engineering leadership, Fivetran customer prospects,
> Allegheny County stakeholders.
> **Presenter:** Chris (Senior Sales Engineer, Fivetran).

---

## 1. The pitch in one paragraph

Allegheny County residents and analysts need to look up property tax
assessments, compare them against neighbors, track appeals, and understand
year-over-year trends. The county already publishes raw data through WPRDC
(Western Pennsylvania Regional Data Center), but raw CSVs aren't usable by
the public. This project ingests that raw data through **two custom
Fivetran connectors**, lands it in **Databricks Unity Catalog**,
transforms it with **dbt** into a clean gold layer, and serves it through
a polished **React/TypeScript single-page application**. The site
includes a natural-language AI agent, an advanced analytics dashboard, a
property insight tool, and a pipeline health page so demo audiences can
*watch* the data flow in real time.

It's a complete, deployable example of the Fivetran-Databricks-dbt
modern data stack with a real product on top.

---

## 2. Business context

| Dimension | Detail |
| --- | --- |
| Domain | Public records — residential & commercial property tax assessments |
| Data source | WPRDC (Western Pennsylvania Regional Data Center) open data portal at data.wprdc.org |
| Primary dataset | "Allegheny County Property Assessments" — 583,000+ parcels, refreshed monthly by the county |
| Secondary dataset | "Allegheny County Finished Property Assessment Appeals" — 60,000+ historical appeals |
| End users | Homeowners researching their own assessments, journalists, county assessors, civic data folks |
| Why it matters | Property tax assessments directly affect every homeowner's annual tax bill. Transparent, queryable access drives accountability. |

---

## 3. Architecture (layer by layer)

```
   ┌─────────────────────────────────────────────────────────┐
   │  Layer 1 — Fivetran custom connectors (Python SDK 2.8)  │
   │  • jason_chletsos_wprdc           (id: equilibrium_safely)
   │  • jason_chletsos_alleghenyre     (id: manifesto_surer)
   └──────────────────────────┬──────────────────────────────┘
                              │  sync every 6 hours
                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Layer 2 — Databricks Unity Catalog warehouse           │
   │  Destination:   unduly_parental  (jason_chletsos_databricks)
   │  Host:          dbc-c48d38b1-67f3.cloud.databricks.com
   │  Warehouse:     /sql/1.0/warehouses/3e84683f91b0ee83
   │  Catalog:       jason_chletsos
   │  Raw schemas:   jason_chletsos_wprdc, jason_chletsos_alleghenyre
   └──────────────────────────┬──────────────────────────────┘
                              │  triggered by connector sync
                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Layer 3 — dbt transformations (Fivetran Transformations)│
   │  Project:       jason_chletsos_tax_assessment           │
   │  Materializes:  jason_chletsos_staging (views)          │
   │                 jason_chletsos_marts   (tables, Delta)  │
   │  Models:        5 staging (stg_*) + 6 marts (dim_*, fct_*)
   └──────────────────────────┬──────────────────────────────┘
                              │  daily snapshot extraction
                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Layer 4 — Static JSON snapshot                         │
   │  scripts/build_snapshot.py        (production: from marts)
   │  scripts/build_wprdc_snapshot.py  (current demo: direct from WPRDC)
   │  Output: frontend/public/data/*.json                    │
   └──────────────────────────┬──────────────────────────────┘
                              │  npm run build → Vite
                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Layer 5 — React SPA on GitHub Pages                    │
   │  Vite + React 19 + TypeScript + Tailwind v4 + Recharts  │
   │  + Leaflet + react-router (HashRouter)                  │
   │  Deployed via GitHub Actions on every push to main      │
   └─────────────────────────────────────────────────────────┘
```

---

## 4. Layer 1 — Fivetran connectors (deep dive)

### Why custom connectors?

WPRDC publishes property data through their CKAN datastore API
(`data.wprdc.org/api/3/action/datastore_search_sql`). There's no
off-the-shelf Fivetran connector for CKAN, so we built two custom
Python SDK connectors. The codebase shows how to use Fivetran's
modern factory-pattern API (`Connector(update=fn, schema=fn)`) — the
project initially used the class-inheritance pattern which was
deprecated in SDK 2.x.

### The two connectors

| Connector | Connection ID | Schema | Purpose |
| --- | --- | --- | --- |
| `jason_chletsos_wprdc` | `equilibrium_safely` | `jason_chletsos_wprdc` | WPRDC Property Assessments (primary parcel data) |
| `jason_chletsos_alleghenyre` | `manifesto_surer` | `jason_chletsos_alleghenyre` | Allegheny County Real Estate appeals & sales |

Both currently run the same code path; in production they'd point at
different upstream endpoints. The connector emits five tables:

| Table | Primary key | Notes |
| --- | --- | --- |
| `parcels` | parcel_id | Property identifier + address + location |
| `assessments` | assessment_id | Per-year roll: assessed, market, land, improvement values |
| `owners` | owner_id | Current owner + mailing address + ownership type |
| `exemptions` | exemption_id | Homestead/senior/veteran/disability flags & dollar amounts |
| `appeals` | appeal_id | Filed/scheduled/approved/denied/withdrawn outcomes |

### Engineering notes for the connector

- **Cents-as-int**: All monetary values are stored as integer cents
  (e.g. `assessed_value = 25000000` for $250,000). Float precision
  bites in tax math, so the connector follows the same pattern
  Stripe and most financial systems use.
- **Cursor-based incremental sync**: State per table keyed by
  `last_updated`. The first sync is a full backfill; subsequent
  syncs only ship rows where `updated_at > state.last_updated`.
  Checkpoint after every page.
- **Retry & rate limit**: A `urllib3` `Retry` strategy handles 429
  and 5xx with exponential backoff, scoped to GET and POST.
- **Deployed via** `scripts/deploy_fivetran_connector.sh` which
  reads `FIVETRAN_API_KEY` + `FIVETRAN_API_SECRET` from env, encodes
  base64, and runs `fivetran deploy --destination jason_chletsos_databricks
  --connection jason_chletsos_wprdc`.

---

## 5. Layer 2 — Databricks Unity Catalog

### Destination configuration

- **Service:** Databricks
- **Region:** AWS_US_EAST_1
- **Host:** `dbc-c48d38b1-67f3.cloud.databricks.com`
- **HTTP path:** `/sql/1.0/warehouses/3e84683f91b0ee83`
- **Catalog:** `jason_chletsos`
- **Auth:** Personal Access Token

### Schemas

| Schema | Purpose | Owner |
| --- | --- | --- |
| `jason_chletsos_wprdc` | Raw landing from connector #1 | Fivetran service principal |
| `jason_chletsos_alleghenyre` | Raw landing from connector #2 | Fivetran service principal |
| `jason_chletsos_staging` | dbt staging views | dbt service principal |
| `jason_chletsos_marts` | dbt mart tables (Delta format) | dbt service principal |

### Why Unity Catalog specifically?

The original spec required Unity Catalog (governed, three-level
namespace, fine-grained access control). The raw schemas are
write-only by the Fivetran service principal; the staging/mart
schemas are write-only by the dbt service principal; the
application service principal has read-only access to marts.
This is exactly the governance model the data team needs to
demonstrate to compliance-conscious prospects.

---

## 6. Layer 3 — dbt project (`jason_chletsos_tax_assessment`)

### Models

**Staging** (materialized as views in `jason_chletsos_staging`):

| Model | Source | What it does |
| --- | --- | --- |
| `stg_parcels` | `source('jason_chletsos_wprdc', 'parcels')` | Trim & cast addresses, ZIPs, coords |
| `stg_assessments` | `…'assessments'` | Convert cents → dollars via `cents_to_dollars` macro, validate tax_year |
| `stg_owners` | `…'owners'` | Normalize owner names, mailing addresses |
| `stg_exemptions` | `…'exemptions'` | Validate exemption types, status values |
| `stg_appeals` | `…'appeals'` | Compute `value_reduction` and `reduction_percentage`, validate status enum |

**Marts** (materialized as Delta tables in `jason_chletsos_marts`):

| Model | Grain | Why |
| --- | --- | --- |
| `dim_parcels` | One row per parcel | Joined with current owner, location |
| `dim_tax_years` | One row per tax year | Year metadata dim |
| `fct_assessments` | parcel_id × tax_year | YoY change calcs, market:assessed ratio |
| `fct_exemptions_summary` | parcel_id × tax_year | Roll-up of exemption types & dollar amounts |
| `fct_appeals_summary` | One row per parcel | Total appeals, approval rate, value reduction |
| `fct_appeals` | One row per appeal | **Gold-layer copy of stg_appeals** so the snapshot/backend can query the marts schema for per-appeal records without reaching into staging |

### dbt tests

- `unique` + `not_null` on every primary key
- `relationships` between fact and dimension tables
- `accepted_values` on `appeal_status` (filed/scheduled/approved/denied/withdrawn)
- Singular test: no negative assessed values

### How dbt is triggered

Through **Fivetran Transformations** (`/v1/transformations` API),
schedule type `INTEGRATED`, bound to the `equilibrium_safely`
connection. Whenever the WPRDC sync completes, the dbt run kicks
off automatically. The transformation project is registered at
`/v1/transformation-projects`, pointing at this Git repo + the
`tax-assessment-app/dbt_project/jason_chletsos_tax_assessment`
sub-path.

---

## 7. Layer 4 — Snapshot extraction

A static GitHub Pages site can't query Databricks at request time.
So we extract a JSON snapshot once per day:

- **`scripts/build_snapshot.py`** — production path. Queries the dbt
  marts via `databricks-sql-connector`, writes `summary.json`,
  `parcels.json`, and per-parcel detail bundles to
  `frontend/public/data/`. Runs in GitHub Actions
  (`refresh-data.yml`) on a daily schedule when
  `DATABRICKS_HOST/HTTP_PATH/TOKEN` repo secrets are set.
- **`scripts/build_wprdc_snapshot.py`** — fast-path used today.
  Pulls 1,162 residential parcels directly from WPRDC's CKAN API
  (filtered to `CLASS = 'R'` and a 30K–2M value band so the
  histogram and median aren't dominated by industrial mega-parcels).
  Covers 10 featured ZIPs:

  | ZIP | Area | Parcel count |
  | --- | --- | --- |
  | 15116 | Glenshaw (presenter's neighborhood) | 250 + every parcel on Angeline Dr, Mt Royal, Butler Plank, Saxonburg |
  | 15217 | Squirrel Hill | 60 |
  | 15222 | Downtown Pittsburgh | 60 |
  | 15206 | East Liberty / Highland Park | 60 |
  | 15212 | North Side | 60 |
  | 15201 | Lawrenceville | 60 |
  | 15228 | Mt Lebanon | 60 |
  | 15215 | Aspinwall / Fox Chapel | 60 |
  | 15213 | Oakland | 60 |
  | 15232 | Shadyside | 60 |

- **`scripts/build_pipeline_status.py`** — extracts live status from
  the Fivetran API + GitHub API into `pipeline.json` for the
  Pipeline Health page.

The snapshot bundle is roughly 7 MB on disk, 1.2 MB gzipped,
serving 1,000+ parcels with full assessment history and real
appeals where available.

---

## 8. Layer 5 — The web application

### Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Bundler | Vite 8 | Fast dev server, modern defaults |
| Framework | React 19 | Latest stable, useTransition for async UX |
| Language | TypeScript 6 strict | Type-safety against the snapshot schema |
| Styling | Tailwind CSS 4 | Utility-first, `@theme` token system, JIT |
| Routing | react-router-dom 7 (HashRouter) | HashRouter avoids GitHub Pages 404s on direct routes |
| Charts | Recharts 3 | Composable, declarative, accessible |
| Maps | Leaflet 1.9 + react-leaflet 5 | OpenStreetMap tiles, no API key needed |
| Data | Static fetch from `/data/*.json` | No backend at request time |
| AI | Anthropic claude-haiku-4-5 (opt-in) | User pastes their own key |

### Pages

| Route | Purpose |
| --- | --- |
| `/` (HomePage) | Hero, search, county KPIs, featured properties, pipeline architecture cards |
| `/search` (SearchPage) | Filterable table — query, city, ZIP, sort by value/change |
| `/parcels/:parcelId` (ParcelDetailPage) | Hero with key metrics, assessment-history chart (Recharts), Leaflet location map, value-breakdown donut, exemptions tiles, appeals table, comparables grid |
| `/analytics` (AnalyticsPage) | County-wide deep dive: P10/median/P90 KPIs, value distribution histogram, assessed-vs-market scatter, top cities, ZIP performance table, land-use composition bars, biggest YoY movers |
| `/agent` (AgentPage) | **Property Insight Agent** — natural-language question box. Local rules engine handles intents like "biggest jumps", "show me parcels in ZIP X", "compare cities". Optional "Ask Claude" mode calls Anthropic API directly from the browser using the user's own key. |
| `/pipeline` (PipelinePage) | **Pipeline Health dashboard** — live status of all five layers: connectors, warehouse, dbt project, transformation, GitHub Pages |
| `/insights` (InsightsPage) | Lighter aggregations page (legacy) |
| `/about` (AboutPage) | Architecture explainer with each step of the data stack |

### Responsive design

- Sticky header collapses to a hamburger drawer below `lg` (1024px)
- Search input lives in the drawer on mobile, in the header on desktop
- Tables wrap in `overflow-x-auto` so they horizontal-scroll on mobile
- Source badge condenses to a colored dot on very narrow screens
- All grids use Tailwind responsive prefixes (`md:`, `lg:`)
- Recharts `ResponsiveContainer` keeps charts fluid

### Data refresh badge

The header shows a small pill: **"Databricks · 2h ago"** (live snapshot
from marts) or **"Demo"** (curated fallback). The badge reads
`generated_at` and `source` from `summary.json`.

---

## 9. Deployment & operations

### Repos & branches

| Repo | Branch | What lives there |
| --- | --- | --- |
| `fivetran-jasonchletsos/tax-assessment-databricks-demo` | `main` | Everything: frontend, backend, dbt, connector, scripts, workflows |

### GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `deploy.yml` | Push to `main` (paths: `tax-assessment-app/**`) | Build SPA + upload to GitHub Pages |
| `refresh-data.yml` | Daily 06:17 UTC + manual | Run `build_snapshot.py` against Databricks, commit JSON if changed |

### GitHub Pages

- Source: GitHub Actions
- URL: https://fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/
- HTTPS enforced
- Base path configured in `vite.config.ts` as `/tax-assessment-databricks-demo/`

### Required secrets / environment variables

| Place | Name | Purpose |
| --- | --- | --- |
| GitHub repo secrets | `DATABRICKS_HOST` | For daily snapshot refresh |
| GitHub repo secrets | `DATABRICKS_HTTP_PATH` | (same) |
| GitHub repo secrets | `DATABRICKS_TOKEN` | (same) |
| Local shell (deploy only) | `FIVETRAN_API_KEY` | For deploying/updating connector |
| Local shell (deploy only) | `FIVETRAN_API_SECRET` | (same) |
| User browser localStorage | `tax-portal:anthropic-api-key` | For optional Ask Claude mode |

---

## 10. The AI features

### Property Insight Agent (`/agent`)

A **two-tier reasoning system** that runs entirely client-side:

**Tier 1 — Local rules engine (always on).** A small intent
classifier in `src/agent.ts` recognizes around a dozen patterns:
top movers, top decliners, exemption coverage, ZIP filters, owner
search, typical/median values, city comparisons, land-use mix,
substring lookups. Each intent runs a SQL-like aggregation over
the in-browser snapshot and returns a structured response with a
summary, a table, and an optional bar chart. No network call.

**Tier 2 — Claude (opt-in).** If the user pastes their Anthropic
API key into Settings, the Agent page can route questions through
`claude-haiku-4-5` via direct browser API call (using
`anthropic-dangerous-direct-browser-access`). Claude receives only
an aggregated summary of the snapshot (top cities, ZIPs, land-use
breakdown, P50/P90 — *not* individual parcels), plus the user's
question. This protects PII while still letting Claude reason about
trends. If Claude errors, the page silently falls back to Tier 1.

Suggested questions are surfaced as one-click chips for the demo.

### Analytics page

Pure client-side calculations from `src/analytics.ts`:
- Quantile + mean helpers
- Group-by-city / by-ZIP / by-land-use
- Value histogram with configurable bin count
- Outlier detection (parcels with YoY change above threshold)
- Exemption coverage rollup

All charts use Recharts and `ResponsiveContainer`.

---

## 11. Demo flow (for Chris)

A suggested 6-minute walkthrough:

1. **Home (45s)** — Land on the home page. Point out the live pipeline
   badge in the header. Click "Find Property" and type "Forbes" — show
   the search.
2. **Property detail (90s)** — Pick a Squirrel Hill parcel. Show the
   assessment-history chart, the location map, the value-breakdown
   donut, the exemption tiles, the appeals table, the comparables grid.
   Mention every chart traces back through dbt marts.
3. **Analytics (60s)** — Switch to /analytics. Talk through the value
   distribution histogram (residential-focused — explain why the
   filter matters), the city leaderboard, the ZIP table, biggest
   movers.
4. **Ask AI (90s)** — Switch to /agent. Run a couple of local-rules
   questions first ("biggest YoY jumps", "exemption coverage").
   Show that they work offline. Then enable Claude mode and ask
   "Which Squirrel Hill parcels look over-assessed?" — Claude reasons
   over the aggregated summary.
5. **Pipeline Health (60s)** — Switch to /pipeline. Walk through each
   layer: two Fivetran connectors, Databricks destination, dbt
   transformation, GitHub Pages deploy. Every status indicator is
   live.
6. **Wrap (30s)** — Back to /about. Architecture diagram with
   tags. Mention the full stack is in one public repo.

---

## 12. What's currently live vs. pending

### ✅ Live in production

- React SPA deployed to GitHub Pages
- 1,162 real residential parcels from WPRDC in the snapshot
- All 15 Angeline Dr (Glenshaw, 15116) parcels indexed and searchable
- 198 parcels have real appeals from WPRDC's appeals dataset
- Two Fivetran connectors deployed and syncing on schedule
- dbt models all compile and have tests
- Property Insight Agent (local rules) works offline
- Advanced Analytics page with histogram, scatter, KPIs, leaderboards
- Pipeline Health page with live Fivetran/GitHub status
- Responsive across phone/tablet/desktop

### ⏳ Configured but not yet active

- **Daily Databricks refresh** — workflow is in place but needs
  `DATABRICKS_*` repo secrets set in the GitHub repo settings.
- **dbt Fivetran Transformation pointed at this project** — Fivetran
  group `unduly_parental` allows only one project per group, and an
  earlier pokemon-demo project still occupies it. Swap by deleting
  the existing transformation (`suffrage_screened`) and project
  (`hanky_capitalism`), then POST a new project pointed at this
  repo.

---

## 13. Glossary (for someone new)

| Term | What it means here |
| --- | --- |
| Parcel | A single property record (one tax bill = one parcel) |
| Assessed value | The county's estimate of taxable value (not market price) |
| Market value | The county's estimate of what the property would sell for |
| Homestead exemption | A flat reduction in taxable value for owner-occupied residential property |
| Appeal | A property owner's formal challenge to their assessment |
| Mart | A user-friendly, query-ready table (vs. raw or staged) |
| Snapshot | The static JSON published from the marts for the SPA to read |
| WPRDC | Western Pennsylvania Regional Data Center (open data publisher) |
| MUNIDESC | WPRDC's municipality / borough field (used for grouping) |
| CKAN | The open-source data portal software WPRDC runs on |

---

## 14. URLs and IDs cheat-sheet

| Thing | Value |
| --- | --- |
| Live site | https://fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/ |
| Repo | https://github.com/fivetran-jasonchletsos/tax-assessment-databricks-demo |
| Fivetran WPRDC connector | https://fivetran.com/dashboard/connectors/equilibrium_safely |
| Fivetran AlleghenyRE connector | https://fivetran.com/dashboard/connectors/manifesto_surer |
| Fivetran destination | `unduly_parental` (`jason_chletsos_databricks`) |
| Databricks host | `dbc-c48d38b1-67f3.cloud.databricks.com` |
| Databricks catalog | `jason_chletsos` |
| Databricks warehouse | `/sql/1.0/warehouses/3e84683f91b0ee83` |
| dbt project (in Fivetran) | `hanky_capitalism` (currently pointed at pokemon; swap to this repo) |
| WPRDC assessments resource | `9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5` |
| WPRDC appeals resource | `8a7607fb-c93e-4d7a-9b23-528b5c25b1de` |

---

## 15. How to keep extending this

The codebase is structured so the easy adds are obvious:

- **More cities in the snapshot** → edit `FEATURED_ZIPS` in
  `scripts/build_wprdc_snapshot.py`.
- **More search filters** → add columns to `ParcelSearchResult` in
  `frontend/src/types.ts` and to the SearchPage form.
- **More Agent intents** → add an entry to the `intents` array in
  `frontend/src/agent.ts`.
- **More dbt marts** → drop a `.sql` file in
  `tax-assessment-app/dbt_project/jason_chletsos_tax_assessment/models/marts/`,
  add tests in `_marts.yml`, point the snapshot script at it.
- **More dashboards** → reuse the helpers in `frontend/src/analytics.ts`
  and the `Panel` component pattern from `AnalyticsPage.tsx`.
- **Different upstream data** → swap the connector's `update`
  function to call a real API instead of the mock generator.

---

## 16. The why

This isn't just a demo. It's a **reference architecture** that
showcases everything Fivetran does well — custom connectors,
managed transformations, automated scheduling, clean separation of
ingestion/storage/transformation/serving — wrapped in a real-world
product domain that any homeowner can immediately understand.

When a Sales Engineer sits down with a prospect and says "modern
data stack," this is what it looks like *in production*: tests
passing, secrets handled, governance in place, a polished
front-end with AI features, observable from a single dashboard,
deployed publicly without a single piece of infrastructure to
manage.
