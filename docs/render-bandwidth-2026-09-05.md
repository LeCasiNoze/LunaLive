# Render bandwidth incident, 2026-09-05

Workspace: Lucas's workspace (confirmed by owner). Audit window: August 7 to
September 5, 17:50 UTC, not necessarily the invoice's billing cycle.
Source: Render MCP bandwidth_usage; API bandwidth-sources for traffic breakdown.
Units below are the API's `mb`; hourly points describe the preceding hour and
can arrive about an hour late. This is usage, not a verified invoice amount.

| Service | Window MB | September 1-5 MB |
| --- | ---: | ---: |
| Nivoranet | 17591 | 7590 |
| LunaLive API | 9783 | 2828 |
| BlackBox | 2180 | 320 |
| LunaLive static frontend | 508 | 78 |
| LunaLive bot | 274 | 96 |

September breakdown: Nivoranet HTTP 5472 MB, service-initiated 2118 MB;
LunaLive API HTTP 141 MB, service-initiated 2687 MB, WebSocket <1 MB.
Do not attribute the main API consumption to live thumbnails or HLS proxying:
the recorded traffic breakdown does not support that conclusion.

Nivoranet has 297 recruitment profiles. Its admin page rendered all matching
profiles and refreshed the entire server-component tree every 30 seconds.
This is a confirmed amplification defect, but historical per-path request logs
are unavailable, so the whole September 3 peak cannot be attributed to it.
Colocated Discord workers also called their own public Render URL every few
seconds. Pagination (25 rows), automatic refresh reduced to 5 minutes at the
owner's request, a manual refresh button, and loopback calls
are corrected in the Nivoranet repository, without changing authentication.

LunaLive corrections:
- Offline recruitment prospect checks: 15 minutes instead of 3; batches of 4
  instead of 8. This is separate from the actual streamer live-status poller,
  whose cadence and offline detection remain unchanged.
- Cached JPEG previews capped at 640x360, quality 68, with conditional HTTP
  responses. Real radio sample: 295309 bytes -> 58261 bytes (80% smaller).
- Provider image downloads bounded to 5 MiB, including chunked responses;
  timeout covers the body; decoded input capped at 16 million pixels.
- Outbound HTTP counters aggregate destination origins every five minutes.
  No paths, queries, credentials or message bodies are recorded. These counters
  estimate application bytes, NOT total billed traffic or incoming TCP ACKs.

The database already uses Render's internal hostname. Do not migrate it or
upgrade the paid plan based on this incident. No billing settings were changed.
Usage already incurred cannot be undone by deploying these fixes. Check the
next complete hourly Render samples before claiming a measured overall drop.

Verification: API TypeScript check and 4 targeted tests passed; Nivoranet
production build, 68 existing tests and 2 new regression tests passed.
Production API returns 640x360 previews and conditional 304 responses with
zero image bytes. Code commits: LunaLive 0c04f7a6; Nivoranet 46d8cc8 + 9eab4c5.

References:
- https://render.com/docs/outbound-bandwidth
- https://render.com/docs/service-metrics
- https://api-docs.render.com/reference/get-bandwidth-sources
