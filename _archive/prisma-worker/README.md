# _archive/prisma-worker — DECOMMISSIONED 2026-04-30

These three files were the BullMQ + Prisma + SQLite renderer + Metricool poster
that ran the standalone talking-head-video-builder before it was absorbed into
Valhalla.

## Why archived (not deleted)

- `process-video.ts` contains the FFmpeg + whisper composition logic that the new
  Supabase-backed worker still references via `src/lib/{ffmpeg,whisper,pexels,safe-zones}`.
  Keeping the old caller around for one cycle so the lib helpers can be sanity-checked
  against the new worker's call sites.
- `post-video.ts` contains the Metricool integration. Posting moved out of the
  worker entirely — Snotra handles publish from `content_post` rows after a
  `video.approved` Bifrost event. The Metricool patterns here may inform Snotra's
  publish handler when she's wired up.
- `start.ts` is the BullMQ entry point, kept for reference.

## Do NOT

- Restart these. Redis isn't running for them. Prisma points at a SQLite DB that
  no longer reflects pipeline state.
- Import from `_archive/`. The TS path config does not include this folder.
- Treat anything here as the source of truth.

## New worker

`src/workers-v2/process-video.ts` + `src/workers-v2/start.ts`. Polls Valhalla's
`video_output` table via `@supabase/supabase-js`, uploads to `videos-public/outputs/`.
See `src/workers-v2/README.md` for full details.

## Sunset plan

If `src/workers-v2/` runs cleanly for two weeks against live takes, this folder
gets fully deleted along with the unused Prisma + BullMQ + ioredis dependencies
in `package.json`. Tracked as Phase 7 follow-up.
