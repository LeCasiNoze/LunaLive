# LeCasiNoze multichat

Isolated VPS service connecting the official Kick webhook and Twitch EventSub WebSocket to the existing LunaLive chat and calls handlers. No personal LunaLive JWT, casino automation or public video stream is started by this service.

## Runtime

- VPS path `/opt/lunalive-multichat`, user `lunalive-worker`, unit `lunalive-multichat.service`.
- Panel `https://vps-92b153fc.vps.ovh.net/multichat/`, protected by the existing signed LunaClip dashboard session.
- Loopback listener `127.0.0.1:3140`; Caddy publishes `/multichat*`. Only the signed Kick webhook and one-use OAuth callbacks are unauthenticated.
- Application and account credentials are private JSON files under `data/credentials`, directory 0700 and files 0600. Runtime configuration is root-only `/etc/lunalive-multichat.env`.
- `data/relay.sqlite` is a private WAL database for durable inbox, outbox, OAuth states and chat cursor. No credential appears in status responses or application logs.
- Temporary sender identity is the broadcaster `lecasinoze` on both platforms, explicitly approved by the owner. Outgoing message IDs/text are recorded to avoid suppressing the owner's own chat messages.

## Routing

- Only broadcaster `lecasinoze`: Kick ID `24912362`, Twitch ID `535777475`.
- Kick/Twitch → authenticated `/internal/bot/multichat/event` → persisted LunaLive chat + Rumble relay when its live chat exists.
- Viewer `!call` uses the existing calls handler with a stable `platform:userId` identity and no moderation rights. `!discord` reads the existing configured response. `!ping` is a neutral technical check.
- The generic existing LunaLive bot does not re-execute these externally handled commands: their shared-chat text includes the visible source prefix.
- LunaLive/Rumble messages and bot replies → Kick via the common database tail. No historical backlog is sent on first startup; stale events expire after ten minutes.
- Twitch receives replies to commands entered in its own chat. External merged chat is not sent into Twitch by default; Twitch forbids merged third-party activity on the simulcast stream. The panel is a private operator view, not an overlay.
- Unknown send outcomes are preserved as `uncertain`, never blindly resent. The API stores provider event claims before executing a command and refuses ambiguous re-execution.

## Setup and deployment

1. Register confidential Twitch and Kick applications with redirects `/multichat/oauth/{platform}/callback` on the VPS HTTPS origin. Kick webhook: `/multichat/webhooks/kick`.
2. Kick scopes: `user:read channel:read chat:write events:subscribe`. Kick requires profile/email permission; the owner explicitly approved it, and no email is persisted.
3. Twitch scopes: `user:read:chat user:write:chat` only. Developer account 2FA is required by Twitch.
4. Transfer the runtime files and `install-vps.py` into `/home/ubuntu/multichat-stage`, then run the installer as root. It reuses existing runtime configuration and the installed `pg` dependency; it never restarts LunaClip or the video publisher.
5. Deploy the isolated API patch: route, policy, additive migration `mig150_multichat_bridge`, and their app/migrateAll registrations. Check the latest migration number on main before integration.
6. Enter application credentials in the protected panel, then use official OAuth for each account. Refresh tokens rotate automatically; revocation still requires the account owner to authorize again.
7. Enable the relay only after the API bridge and provider subscriptions are confirmed. Send a neutral chat message and `!ping`/`!discord` to verify every link; use isolated fixtures for calls rather than adding a test slot to an active Automod queue.

## Validation

`node --test *.test.mjs` checks the relay, signatures, dedupe, OAuth states, token rotation and uncertain sends. API TypeScript tests cover real HTTP requests against injected fixtures, with no live queue or third-party side effects.

Pause in the panel to stop both the database tail and outgoing messages. Systemd may remain running to preserve its private status/configuration UI. Video fan-out is a separate service and must not be confused with chat readiness.
