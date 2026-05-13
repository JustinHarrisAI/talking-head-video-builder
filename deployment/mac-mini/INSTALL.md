# Mac Mini install — Valhalla Video Worker

Step-by-step deploy for the workers-v2 renderer on the Mac Mini.
Every command is prefixed with where it runs.

## Pre-flight (one-time only)

### 1. Confirm the build folder is on the Mac Mini

```
[SSH → Mac Mini] ls ~/code/JustinHarris.AI/clients/justinharris-ai/builds/talking-head-video-builder/src/workers-v2/
```

Expected: `process-video.ts`, `start.ts`, `README.md`. If the path doesn't
exist, sync the repo first (whatever method you use to keep `~/code/JustinHarris.AI/`
current on the Mac Mini — git pull or rsync).

### 2. Confirm the vault has the keys we need

```
[SSH → Mac Mini] bash ~/code/JustinHarris.AI/agents/vault-keeper/scripts/vault-list.sh | grep SUPABASE
```

Expected to include: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. If either is
missing, store before continuing:

```
[SSH → Mac Mini] bash ~/code/JustinHarris.AI/agents/vault-keeper/scripts/vault-store.sh SUPABASE_URL
[SSH → Mac Mini] bash ~/code/JustinHarris.AI/agents/vault-keeper/scripts/vault-store.sh SUPABASE_SERVICE_KEY
```

### 3. Confirm `pnpm`, `tsx`, `ffmpeg` are on PATH

```
[SSH → Mac Mini] which pnpm tsx ffmpeg
```

If any of those is missing:

```
[SSH → Mac Mini] brew install ffmpeg
[SSH → Mac Mini] corepack enable      # if pnpm is missing
```

`tsx` is in the build's devDependencies; `pnpm install` brings it.

## Install (run in order)

### 4. Install dependencies in the build folder

```
[SSH → Mac Mini] cd ~/code/JustinHarris.AI/clients/justinharris-ai/builds/talking-head-video-builder
[SSH → Mac Mini] pnpm install
```

This installs `@supabase/supabase-js` (added to package.json this session) plus
the existing renderer deps. First install pulls a few hundred MB; subsequent
installs are quick.

### 5. Smoke-test the wrapper script before handing it to launchd

```
[SSH → Mac Mini] bash ~/code/JustinHarris.AI/clients/justinharris-ai/builds/talking-head-video-builder/deployment/mac-mini/start-valhalla-video-worker.sh
```

Expected output, within ~5 seconds:

```
[worker-v2] started; polling every 10000ms; bucket=videos-public
```

Then it idle-polls. Press `Ctrl+C` to stop.

If you see a stack trace, fix the env / vault / path issue before installing
the launchd unit. The plist will just keep restarting a broken script forever.

### 6. Drop the plist into LaunchAgents and load it

```
[SSH → Mac Mini] cp ~/code/JustinHarris.AI/clients/justinharris-ai/builds/talking-head-video-builder/deployment/mac-mini/com.justinharris.valhalla-video-worker.plist ~/Library/LaunchAgents/
[SSH → Mac Mini] launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.justinharris.valhalla-video-worker.plist
[SSH → Mac Mini] launchctl enable gui/$(id -u)/com.justinharris.valhalla-video-worker
[SSH → Mac Mini] launchctl kickstart gui/$(id -u)/com.justinharris.valhalla-video-worker
```

`bootstrap` registers the unit, `enable` lets it auto-start, `kickstart` runs
it now without waiting for the next login.

### 7. Verify it's actually running

```
[SSH → Mac Mini] launchctl print gui/$(id -u)/com.justinharris.valhalla-video-worker | head -30
[SSH → Mac Mini] tail -F /tmp/valhalla-video-worker.out.log
```

Expected log line: `[worker-v2] started; polling every 10000ms; bucket=videos-public`.

## Operate

### View live log

```
[SSH → Mac Mini] tail -F /tmp/valhalla-video-worker.{out,err}.log
```

### Restart (e.g., after a code update)

```
[SSH → Mac Mini] launchctl kickstart -k gui/$(id -u)/com.justinharris.valhalla-video-worker
```

### Stop (don't unload — just stop)

```
[SSH → Mac Mini] launchctl stop com.justinharris.valhalla-video-worker
```

### Uninstall

```
[SSH → Mac Mini] launchctl bootout gui/$(id -u)/com.justinharris.valhalla-video-worker
[SSH → Mac Mini] rm ~/Library/LaunchAgents/com.justinharris.valhalla-video-worker.plist
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Worker exits immediately, log says "vault-read.sh missing" | `~/code/JustinHarris.AI/` not synced or vault not initialized on Mac Mini | Run `bash ~/code/JustinHarris.AI/agents/vault-keeper/scripts/init-vault.sh` |
| Worker exits immediately, log says "SUPABASE_URL not set" | Vault has the wrong key name or is empty | `bash vault-list.sh` to confirm; `vault-store.sh KEY` to set |
| `launchctl bootstrap` returns "input/output error" | Already loaded | `launchctl bootout gui/$(id -u)/com.justinharris.valhalla-video-worker` first, then bootstrap |
| Worker runs but never claims a job | No queued rows in `video_output` | Record a take in the admin UI and select it; row should appear with `status='queued'` |
| Worker claims but can't download | RLS or wrong bucket | Verify `SUPABASE_SERVICE_KEY` is the service-role key (bypasses RLS) and `VIDEOS_BUCKET` env (default `videos-public`) matches migration 15 |
| Caption overlay throws SafeZoneViolation | Subtitle margins outside platform safe zones | This is intentional — fix `src/lib/safe-zones.ts` defaults if the constraint genuinely shifted; otherwise the caption WILL be hidden in the rendered video, and we'd rather fail loud |

## What this worker does NOT do

- Does NOT post to social. Posting is decoupled — Snotra handles publish from
  `content_post` rows after a `video.approved` event lands. See migration 24
  (`fan_video_approved_to_content_post` trigger) for that bridge.
- Does NOT write to Notion. Notion is org-deprecated as of 2026-04-28.
- Does NOT register with the VPS scheduler. INV-3 — long-running poll-based
  worker is a persistent local service, not a scheduled task.
