# Legacy URL redirect

`index.html` redirects all visitors from the old URL
(`fivetran-jasonchletsos.github.io/fivetran-sheetz-demo/`) to the new one
(`fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/`),
preserving any in-bound path / query / hash.

## Deployment (one-time)

GitHub Pages doesn't auto-redirect renamed repositories. Two options:

### Option A — keep the old repo alive as a redirect-only site (recommended)
1. Don't delete the existing `fivetran-sheetz-demo` GitHub repo.
2. Replace its contents with just the file `legacy-redirect/index.html` from
   this folder, at the root of the repo.
3. Ensure GitHub Pages is still enabled (Settings → Pages → branch: main, root).
4. Push.

After this, the old URL serves a meta-refresh + JS redirect.

### Option B — point the old domain at the new one via CNAME
If you ever wire up a custom domain, set a 301 at the CDN/DNS layer instead.

## Verifying
After deployment, visiting any of these old URLs should land on the new site:
- `https://fivetran-jasonchletsos.github.io/fivetran-sheetz-demo/`
- `https://fivetran-jasonchletsos.github.io/fivetran-sheetz-demo/pipeline`
- `https://fivetran-jasonchletsos.github.io/fivetran-sheetz-demo/dashboard?zip=15217`
