# Hunt workspace: design, collaboration and preservation

## Scope

- Purple LunaLive interface, Manrope typography, tabular amounts; farm, opening,
  results, archive list, archive dialog and destructive-action confirmations.
- Four phase-relevant indicators, editable bets, explicit zero payouts, selected
  bonus navigation, catalogue suggestions and responsive layouts.
- State refresh every three seconds while visible, immediate refresh on network
  recovery/visibility return, one request at a time, request cancellation on edits.
- Private revalidated responses (ETag), no automatic archive downloads per tick,
  and schema initialization shared once per API process instead of every read.
- Drafts survive refreshes and temporary disconnections. A remote mode change or
  removal keeps the edited form visible until the operator cancels the draft.
- Atomic compare-and-set for start/bet/pay. Legacy callers without `expected`
  remain supported. Explicit calls payout IDs prevent crediting the next bonus
  after someone else has already validated the selected bonus.

## Preservation

No migration, destructive startup operation, account remapping or localStorage
replacement of hunt data is introduced. Existing `hunt_sessions`,
`hunt_session_items`, `calls_hunt_sessions`, `calls_queue` and `hunt_archives`
remain the sources of truth. Mounting or reloading only reads the hunt.

Archived hunts open read-only. In particular the old calls archive-load alias
which called reset is no longer invoked by this page. Starting a new hunt requires
confirmation and a successful safety copy before reset. Ending a hunt is explicit
on this new UI; legacy automatic ending remains supported for older callers.
Calls ending now saves its bonus snapshot and retains the queue for consultation.

The push does not save a value that has never been submitted: users should finish
or cancel their active inputs before reloading to receive the new interface.
No tests were performed against a production user hunt.

## Verification

- API TypeScript compilation (`tsc --noEmit -p api/tsconfig.json`).
- Web TypeScript compilation (`tsc -b web`) and Vite production build.
- `scripts/hunt-workspace-qa.mts`: real route handlers, isolated in-memory
  PostgreSQL via PGlite, local-only test JWTs and Playwright/Edge headless.
- Financial parsing (French decimal commas, invalid/negative inputs, zero gain),
  remaining break-even calculation and legacy calls mapping.
- Same-field conflict returns 409; writes cannot cross account ownership;
  editing start preserves mode; calls payout addresses the selected bonus;
  double open and double close are idempotent for the tested paths.
- Two browser pages: additions, bet changes, payouts and phases synchronize;
  local conflicting drafts stay intact; remote phase change does not unmount
  an edited form; reload/archive viewing do not write hunt data.
- Offline/reconnect preserves draft; canceling reset does nothing; confirming
  reset produces a safety copy containing all the preceding items.
- Screenshots reviewed at 1440px desktop and 390px mobile. No horizontal overflow
  at 390px or 320px; native dialogs render above the entire page.

Local test prerequisites (not production dependencies): install
`@electric-sql/pglite` under `.qa-deps`; set `PLAYWRIGHT_MODULE` to a Playwright
module if not using the bundled runtime. Start Vite on port 5198 with
`VITE_API_BASE=http://127.0.0.1:5199`, then from repository root run:

```powershell
node --import ./api/node_modules/tsx/dist/loader.mjs scripts/hunt-workspace-qa.mts
```

The fixture server and embedded database are created and torn down by that
script. Real APIs and tracking are blocked in the browser test. Screenshots are
local artifacts under `exports/hunt-workspace-qa`, not part of the deployment.
