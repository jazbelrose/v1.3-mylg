# Dashboard Preview Mode (Dev Only)

The dashboard can now be loaded without signing in when you are running the
frontend in Vite's development mode. This is intended purely for layout and UX
validation – the data shown is static fixture content and no backend requests or
mutations are performed.

## Enable preview mode

1. Start the frontend with `npm run dev` (or any command that launches Vite in
   dev mode).
2. Open the dashboard route with the `preview` query parameter:

   ```text
   http://localhost:5173/dashboard?preview=1
   ```

   This flag is stored in `sessionStorage`, so navigating around the app keeps
   the dashboard unlocked for the current tab.

## Disable preview mode

Use any of the following options:

* Visit any route with `?preview=0` (for example
  `http://localhost:5173/dashboard?preview=0`).
* Clear `sessionStorage['dashboardPreviewMode']` in your devtools console.
* Close the tab (a fresh session starts without preview).

## Notes

* Preview mode is **only** available when `import.meta.env.DEV` is true. It is
  ignored in production builds.
* The sample data includes two example projects, a handful of collaborators,
  and representative inbox/messages activity so that core dashboard widgets
  render as expected.
* Previewing invoices is supported: open a project budget and launch the
  **Invoice Preview** modal to review the full sample invoice, including brand
  and client information, without signing in.
* Actions that would normally persist data (e.g. saving settings) are turned
  into no-ops – use this mode only to check styling and layout.
