---
session: 1
date: 2026-04-11
agent: baldr (video-editor)
---

## Decisions Made

- Safe zone enforcement is a hard pre-flight, not advisory. Job fails before FFmpeg runs if margins violate platform zones.
- `SAFE_SUBTITLE_DEFAULTS` is the single source of truth for all caption margins: `{ marginV: 320, marginR: 160, marginL: 60 }`.
- Worker logger replaces all `console.log/warn/error` calls — uses `process.stdout/stderr.write` directly to avoid hook interference.

## Current State

Safe zone system is fully wired and TypeScript-clean (one pre-existing unrelated error in `src/lib/db.ts` L8 — `PrismaClient()` missing adapter arg, not our work).

### Files Added/Modified

| File | Change |
|------|--------|
| `src/lib/safe-zones.ts` | New — TypeScript validator: `validateElement`, `validateSubtitleParams`, `SafeZoneViolation`, `SAFE_SUBTITLE_DEFAULTS` |
| `src/lib/safe-zones.js` | New — ES module version for Node test runner |
| `src/lib/safe-zones.test.js` | New — 13/13 tests passing (violation cases blocked, valid positions pass) |
| `src/workers/process-video.ts` | Modified — pre-flight validation wired at Step 4; fixed hardcoded `MarginV=60` bug; replaced all `console.*` with worker logger |
| `agents/video-editor/SKILL.md` | Modified — added Platform Safe Zones section, ASCII diagram, QA checklist row |

### Root Bug Fixed

`composeWithFFmpeg` had `MarginV=60` hardcoded. That placed captions 60px from the bottom — directly inside the 300px Instagram/TikTok action bar zone. This was the cause of the username bar overlapping captions on the published Instagram video.

Now uses `SAFE_SUBTITLE_DEFAULTS.marginV = 320` (20px buffer beyond the 300px keep-out).

### Safe Zone Constants

```
Frame: 1080x1920 (9:16)
Keep-out: TOP=130px, BOTTOM=300px, RIGHT=150px, LEFT=50px
Safe zone: x 50–930, y 130–1620
Critical text zone: x 80–900, y 200–1520
Caption defaults: marginV=320, marginR=160, marginL=60
```

## Pending Tasks

- `src/lib/db.ts` L8: pre-existing `TS2554` — `PrismaClient()` needs adapter arg (same pattern as the worker uses). Not blocking anything today but worth fixing.
- No Remotion compositions have been validated yet — safe zone checks are only wired into the FFmpeg path. When Remotion work resumes, use `validateElement()` from `safe-zones.ts` on every layer.

## Context for Next Session

- `validateSubtitleParams` is called with `SAFE_SUBTITLE_DEFAULTS` before every compose. If you change the defaults, the validator will throw immediately — that's by design.
- The `SafeZoneViolation` error class has `elementName` and `violations[]` properties for structured error handling if needed later.
- Test runner: `node --input-type=module < src/lib/safe-zones.test.js` (or just `node src/lib/safe-zones.test.js` if `"type": "module"` is in package.json).
