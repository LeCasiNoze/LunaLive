# Hunt owner promotion

Use `scripts/promote-hunt-owner.mjs` for an explicitly authorized viewer-to-streamer conversion with a personal hunt. It defaults to a read-only preview. `--apply` archives the original hunt, creates the channel and moderator, copies the full active queue and session, checks every copied name/position/bet/pay/bounty, and commits atomically. The original personal rows are retained. Existing channels and duplicate machines are rejected for manual reconciliation. No credentials, bot relay permissions, or live broadcasts are enabled.

## Completed operation

- Account 174 promoted to streamer; channel 170, slug `norberti`, display name `Norberti`.
- LeCasiNoze (user 4) added as active moderator.
- 16 machines copied with their exact positions, bets and null payouts; farm phase and start preserved.
- Safety archive 10 created before promotion; personal source remains intact.
- Authenticated production GETs as LeCasiNoze returned HTTP 200 and `canModerate: true` for both calls and hunt. Hunt returned all 16 bonuses.
- No test calls or payouts were submitted to production.

The channel bot menu previously also posted start edits to `/api/hunt2/set-start`, which addresses the authenticated moderator's personal hunt, not the displayed channel. That extra write was removed; only the slug-scoped channel endpoint remains. TypeScript and production Vite build passed.

After promotion, both users should finish any unsaved input and reload their pages. The owner may need to sign in again for role-dependent features. The moderator should use their own account and `/s/norberti`, not the temporary admin impersonation session.
