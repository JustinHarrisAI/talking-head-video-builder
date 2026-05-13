# workers-v2 — Phase 6 cutover (2026-04-30)

Replaces the BullMQ + Prisma worker at `src/workers/` with a single Postgres-poll renderer
that reads from Valhalla's `video_output` table directly via `@supabase/supabase-js`.

## Why the rewrite

Phase 1 of S20 shipped Valhalla migration 15 (`video_*` tables, `videos-public` Storage
bucket, RLS gated to `justin@justinharris.ai`). Phase 2 shipped the Next.js admin UI
under `app/video-editor/` in the Valhalla repo. The old Prisma + BullMQ + SQLite worker
in `src/workers/` is now stranded: wrong DB, wrong storage, no RLS path.

Phase 6 collapses this into a single renderer:

- One worker process (no Redis, no BullMQ).
- Polls `video_output` where `status='queued'` (the row Sindri's UI creates when Justin
  selects a take).
- Atomically claims it via conditional `UPDATE ... WHERE status='queued'`.
- Reuses the existing `src/lib/{ffmpeg,whisper,pexels,safe-zones}` pipeline.
- Uploads the final MP4 to `videos-public/outputs/{output_id}.mp4`.
- Flips status `queued → editing → awaiting_approval` with `public_url` + `output_path`.
- On error: status='error', `error_log` populated, row stays put for manual re-queue.

Posting is gone from this folder. After Justin approves a row in the Library UI, Sindri's
API emits `video.approved` to `event_inbox`. Snotra (downstream, separate session)
inserts a `content_post` row and handles publishing. Phase 6 is render-only.

## Host

Mac Mini. CONSTITUTION §1.1 explicitly lists "Valhalla CLI worker" as a Mac Mini service.
INV-3 forbids *scheduled* tasks on Mac Mini; a long-running poll-based renderer is a
persistent local worker, not a scheduled task. The VPS scheduler is not involved here.

## Env

```
SUPABASE_URL=https://skolvachwinlqmgzznwh.supabase.co
SUPABASE_SERVICE_KEY=<service-role key from vault>
VIDEOS_BUCKET=videos-public        # default
POLL_INTERVAL_MS=10000             # default
WORK_DIR=/tmp/valhalla-worker      # default = ./storage/processed
```

Get `SUPABASE_SERVICE_KEY` via:
```
bash agents/vault-keeper/scripts/vault-read.sh SUPABASE_SERVICE_KEY
```

## Install + run

```
cd clients/justinharris-ai/builds/talking-head-video-builder
pnpm add @supabase/supabase-js
pnpm workers:v2
```

(`workers:v2` script: see `package.json`. Add `"workers:v2": "tsx src/workers-v2/start.ts"`
if not already there.)

## Old worker

Archived to `_archive/prisma-worker/`. Do not restart. Do not import from there. The
Prisma client + BullMQ + Redis dependencies stay in `package.json` until the rest of
the legacy app surface is sunset.

## Verification

```
# 1. Boot the worker locally with vault env loaded.
# 2. From Valhalla admin UI, record a take and select it (this creates a queued
#    video_output row).
# 3. Watch worker log: should claim, transcode, transcribe, compose, upload, flip.
# 4. Refresh /video-editor/approve — row should appear with playable preview.
```

## Known gaps

- No retry on transient FFmpeg/whisper failures. Row goes straight to `status='error'`.
  Justin re-queues manually by setting `status='queued'` in the Library UI (or via SQL).
- No concurrency. Single-worker assumption. If we ever run more than one process,
  the conditional-update claim is correct but two workers will idle-poll the same row
  briefly. Fine for one-operator usage.
- `editing_tier` only switches B-roll on/off. Heavy tier should add intro/outro and
  branded lower-thirds — punted to a follow-up session.
