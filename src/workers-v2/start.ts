/**
 * workers-v2 entry point — Phase 6 cutover.
 *
 * Run on Mac Mini with:
 *   pnpm workers:v2          (or npm run workers:v2)
 *
 * The renderer is the only worker now. Posting (post-video.ts) is decoupled —
 * Snotra handles publish from `content_post` rows after a `video.approved`
 * event, not from a job queue.
 *
 * The renderer module logs its own boot line via process.stdout.write, so
 * this file is effectively a one-import bootstrapper. SIGINT is wired inside
 * process-video.ts.
 */
import "./process-video";
