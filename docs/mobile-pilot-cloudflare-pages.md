# Cloudflare Pages mobile pilot

This runbook publishes only the Koalafrog HQ frontend. The generated URL is public; privacy depends on Supabase Auth and RLS, not obscurity of the Pages address.

## Cloudflare Pages settings

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `22.16.0` (also pinned in `.node-version`; set `NODE_VERSION=22.16.0` if the Pages build environment does not honor it)
- Production environment variables (names only):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_WORKSPACE_REPOSITORY=supabase`

Do not add a service-role or secret key to Cloudflare. Every `VITE_` value is compiled into browser-readable JavaScript.

## First deployment

1. In Cloudflare, connect the Koalafrog GitHub repository and create a Pages project.
2. Apply the settings above and add the three production environment variables.
3. Perform the first deployment and record the exact generated `https://<pages-hostname>` URL.
4. Confirm `/_redirects`, `/_headers`, the manifest, and icon were copied into the deployment.

## Supabase Auth configuration after the URL exists

1. Set the production Site URL to the exact HTTPS Pages origin: `https://<pages-hostname>`.
2. Add the exact Redirect URL `https://<pages-hostname>/auth/recovery`.
3. Retain `http://127.0.0.1:4173/auth/recovery` for local development.
4. Retain any other legitimate production or development redirect URLs.
5. Verify the recovery email template uses `{{ .RedirectTo }}` where the callback target is required.
6. Avoid broad production wildcards when the exact Pages URL is known.

## Mobile verification

- Open the Pages URL using mobile data rather than home Wi-Fi.
- Sign in and confirm dashboard hydration.
- Open Benchmark Lab, Beard Studio, Formulas, and Natural Deodorant Studio.
- Create one clearly named disposable record, save it, refresh, and confirm hosted persistence. Remove it only through a safe supported deletion action.
- Log out and sign in again.
- Request password recovery from the deployed app, open the newest link on the phone, and confirm it never redirects to localhost.
- Add the app to the home screen, close it, and reopen it from the icon.
- Confirm the hosted Supabase repository is active and no legacy localStorage fallback is used.
- When practical, inspect the production console and network requests from desktop developer tools.

## Rollback

Roll Cloudflare Pages back to the prior deployment. A frontend rollback does not require database migrations. Restore the Supabase Site URL only if the production Pages URL is abandoned; retain legitimate redirect URLs still in use.
