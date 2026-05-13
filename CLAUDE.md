# Talking Head Video Builder

## What This Is
Web app for producing talking head videos at scale. Record takes against scripts, auto-edit (captions, B-roll, hook effects), approve, auto-post via Metricool.

## Tech Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **State:** Zustand
- **Database:** SQLite via Prisma
- **Job Queue:** BullMQ + Redis
- **Video Processing:** FFmpeg (native) + Remotion (overlays/captions)
- **Speech-to-Text:** whisper.cpp (local)
- **Social Posting:** Metricool API
- **B-Roll:** Pexels API + user uploads

## Key Paths
- `src/app/` - Next.js pages and API routes
- `src/components/` - React components
- `src/lib/` - Shared utilities (db, queue, API clients)
- `src/workers/` - Background job processors
- `remotion/` - Remotion video compositions
- `storage/` - Local file storage (gitignored)
- `prisma/schema.prisma` - Database schema

## Branding
- Generic/white-label by default. Each brand configures their own settings.
- Justin's instance: IBM Plex Sans, #7F9590 (Architectural Green), 0px border-radius
- Full brand guide: `../../brand/brand-visual-style-guide.md`

## Rules
- All video processing runs async via BullMQ workers
- Raw takes stored temporarily; deleted after user selects winner
- Metricool API requires MP4 format, publicly accessible URLs
- whisper.cpp uses medium model for accuracy/speed balance on M2

@AGENTS.md
