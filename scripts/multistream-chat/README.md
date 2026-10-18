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
- Viewer `!call` and `!listec` use the existing calls handler with a stable `platform:userId` identity and no moderation rights. `!discord` and `!site` read existing configured responses; `!help`/`!aide` provide viewer help. `!ping` is a neutral technical check. Wallet/shop/music parity is not implied by this restricted command bridge.
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

## OBS video controls

`install-video.py` installs a private Unix-socket control service, without relaxing the chat service's `NoNewPrivileges` setting or granting it sudo. The root helper accepts only status, destination configuration, enable/disable, and start/stop of the existing manual publisher. Its socket is limited to `lunalive-worker` and also verifies the peer UID. Stream keys are stored in `/etc/lunalive-multistream/destinations.json` (root:automod, 0640; directory 0750), never returned by the panel.

The manual publisher keeps its existing `publication_guard` lease and OBS ingest `rtmp://127.0.0.1:1936/manual/live`. The existing Windows OBS gate listens on 127.0.0.1:6622 and forwards through SSH port 6633. The personal profile/collection is `LeCasiNoze — Live`. Mode changes remain owned by the canonical `publication_control.py` and desktop shortcuts (`Passage vers mon live`, `Préparer mon live`, `Terminer mon live`, `Reprendre AutoMod`), including Rumble's ended-live checks. This panel cannot bypass that preparation or interrupt an active publisher.

The fan-out copies H.264/AAC through three independent FFmpeg outputs without encoding. OBS enters through RTMP; Automod supplies its already encoded MPEG-TS on stdin. Queues are bounded; a slow or failed destination reconnects independently. Each destination can be disabled immediately. Runtime byte counts alone do not prove a public live: the chat service also checks the official Kick/Twitch live states every minute, persists the last health result and logs state changes without credentials.

`integrate-automod.py` applies a narrowly anchored, reversible adapter to `/opt/automod/deploy/automod-scene-publisher.mjs`. It preserves the existing overlay, audio, game and publication lease; it routes the existing mux to the fan-out. An optional expected SHA prevents overwriting a file changed by another task. `activate-automod.py` performs an explicitly authorized transport-only restart with temporary stop-hook suppression so gameplay/music remain unchanged, and rolls back on failed transport validation. Normal stop hooks are restored afterwards. Never use this to start the game engine.

The adapter source now also prepares a 30 FPS encode for Kick compatibility. The running encoder remains at 24 FPS: the automatic approval reviewer rejected the additional cadence change/restart pending precise owner authorization. Do not claim Kick's warning fixed or activate the 30 FPS change without that authorization. The candidate was prepared for a private file probe, not applied to the active publisher.

Deployment: transfer all top-level runtime files, both installers and both service units to `/home/ubuntu/multichat-stage`. With the manual OBS publisher stopped, run `sudo python3 /home/ubuntu/multichat-stage/install-video.py`, then `sudo python3 /home/ubuntu/multichat-stage/install-vps.py`. Restart `lunalive-multistream-admin` and `lunalive-multichat` after code updates. No public stream is started by either installer.

Video tests: `python3 test_multistream.py` on Linux checks official ingest allowlists, safe owner switching, refusal while a publisher holds the lock, blocked-destination isolation, and three local FLV outputs preserving all 100 frames plus H.264/AAC and duration. These use synthetic media and temporary files only.

## Verified deployment — 18 October 2026

- API PR #43 merged at `59ee99a1a702468ccb7f911aa9ade2ecfc5ee6e1`, Render deploy `dep-dba08h3rjlhs73c5f85g` live. The additive migration and authenticated bridge respond successfully.
- Both real accounts authorized, official subscriptions established. A Twitch `!ping` reached LunaLive, received its Twitch response and appeared on Kick. A Kick `!discord` reached LunaLive, and the shared Discord response appeared on Twitch.
- Real refresh grants succeeded for both providers using the runtime user; the private credential files remained owned by `lunalive-worker` with mode 0600. The service restarted, reconnected, and retained its durable queues.
- First, Twitch's official `bandwidthtest=true` mode accepted 360 synthetic frames without a public stream. After the owner explicitly authorized the active Automod test, Kick and Twitch both reported live, in French, with the Slots/Slots & Casino categories. Rumble's existing live remained active.
- The Automod publisher now sends its encoded video to all three destinations. A deliberate failure of only the Kick remux recovered automatically (Kick reconnect count +1), while Rumble/Twitch retained their processes and kept advancing. No game operation was issued.
- Kick/Twitch/Rumble manual destinations remain enabled for the next OBS session. A full synthetic OBS RTMP → fan-out → three local FLV test preserved all 100 frames and AAC audio. The existing Windows gate's seven tests passed; its gate, tunnel and overlay were verified listening. OBS was closed and its dedicated personal profile was selected with the existing backed-up selector.
- Kick's dashboard warns about the active 24 FPS input, recommending 30/60. Both public casino players showed age/region restrictions in the operator browser; receiving a stream does not imply visibility in every region. Classification has not been falsified to bypass that restriction.
- BotRix already answers `!discord` on Kick with a different invitation. Avoid keeping two competing command responders when calibrating that channel.
- Ordinary external viewer messages are not forwarded into Twitch by default. Neutral shared Discord invitations and replies to commands entered on Twitch are supported. No merged-chat overlay is introduced.

## Compact replies and duplicate control

Verified bot replies use compact English on Kick/Twitch, preserving native display names. Human messages are never translated or content-deduplicated. Plain `!call game` examples avoid Kick interpreting angle brackets as markup. LunaLive-only rain UI prompts are omitted there.

Identical bot replies have a persistent 20-second cooldown per destination, in addition to provider-event and database-message IDs. Kick Discord replies wait five seconds and yield if the existing BotRix answered with a verified invitation to the same LeCasiNoze server; otherwise the relay answers. Other BotRix features remain intact.

Migration 151 separates external call identity from displayed username and backfills verified names without moving calls. The API filters the configured dedicated Rumble bot before persisting or dispatching its echoed messages, so a help response cannot turn into a phantom call. Shared broadcaster identities retain human commands.

## Automatic mode titles — 18 October 2026

`mode-title-sync.mjs` polls the canonical publication owner and the local Automod status every 15 seconds. Only an active Automod publisher with a running controller can change titles. A stable mode is debounced; classic mode, bonus farming and bonus opening have distinct titles. Kick and Twitch use English, keep their existing language/category/age labels, and verify the title through the official channel API. Personal OBS ownership and inactive publishers cause no title write. An ownership/mode recheck runs immediately before each PATCH.

The dedicated `/multichat/oauth/{platform}/start?titles=1` consent flow adds `channel:write` on Kick or `channel:manage:broadcast` on Twitch. Existing chat-only authorizations remain valid. The optional `manageTitles` authorization parameter from PR #53 remains supported. A title authorization must belong to the broadcaster and include the new scope before it replaces the stored credential. Lucas approved both permissions and both grants were completed on 18 October. Token refresh retains the granted scopes and existing private vault ownership.

Real offline checks changed classic/farming/opening titles on Twitch and restored the prior title. Kick accepted the writes; its public API returned an absent title while offline, so the actual changes and restoration were checked in its official dashboard. An absent offline title is `null`, never fabricated as a confirmed match. While live, verification is retried with the normal poll. No game, call or public stream was started for these tests.

Rumble is **not connected for title writes**. Its documented public Live API exposes titles for reading. The account's official edit dialog permits title changes, but requires an authenticated editor session. No personal browser cookies were exported, no write endpoint was guessed and no Rumble title was changed. The panel explicitly reports this remaining adapter/session requirement; French desired titles are prepared only. A dedicated VPS editor session, safe form update/read-back, and a live mode-transition test remain necessary before claiming all three platforms supported.

The root stream-control helper and its `RestrictAddressFamilies=AF_UNIX` sandbox remain unchanged: local mode information is read by the existing network-capable Node service and reduced to mode/phase. It never returns the Automod control nonce or financial/session data. Video publishers, ownership controls, rendering services and credentials are not restarted or replaced by the title synchronizer.

Sources: [Twitch Modify Channel Information](https://dev.twitch.tv/docs/api/reference/#modify-channel-information), [Kick Channels](https://docs.kick.com/apis/channels), [Rumble Live Stream API](https://rumble.support/help/how-to-use-rumble-s-live-stream-api).
