/**
 * Phase 6 worker — Valhalla cutover (2026-04-30, Baldr).
 *
 * Replaces the old BullMQ + Prisma worker (../workers/process-video.ts).
 *
 * Loop:
 *   1. Poll `video_output` where status='queued' (oldest first, single row).
 *   2. Atomically claim it by flipping status to 'editing' (skip if a peer raced us).
 *   3. Look up the linked `video_take`, download its blob from
 *      `videos-public/takes/{script_id}/{take_id}.webm`.
 *   4. Run the existing FFmpeg + whisper + pexels + safe-zones pipeline (unchanged
 *      from the Prisma worker — only the I/O at both ends changed).
 *   5. Upload final MP4 to `videos-public/outputs/{output_id}.mp4`.
 *   6. Flip status to 'awaiting_approval' with `public_url` + `output_path`.
 *
 * On any thrown error: status='error', error_log set, row stays in error state until
 * Justin re-queues it from the Library UI (or runs a manual UPDATE).
 *
 * Host: Mac Mini (per CONSTITUTION §1.1 "Valhalla CLI worker"). INV-3 forbids
 * scheduled tasks on Mac Mini, but a long-running poll-based service is a
 * persistent local worker, not a scheduled task. The scheduler (VPS) is not
 * involved here.
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  (service-role; bypasses RLS for the worker)
 *   VIDEOS_BUCKET         (default 'videos-public')
 *   POLL_INTERVAL_MS      (default 10000)
 *   WORK_DIR              (default `${cwd}/storage/processed`)
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { extractAudio, transcodeToMP4, downloadFile } from "../lib/ffmpeg";
import { transcribe, segmentsToSRT } from "../lib/whisper";
import { searchBrollClips } from "../lib/pexels";
import {
  validateSubtitleParams,
  SAFE_SUBTITLE_DEFAULTS,
  FRAME,
} from "../lib/safe-zones";

const log = (...args: unknown[]) =>
  process.stdout.write("[worker-v2] " + args.map(String).join(" ") + "\n");
const warn = (...args: unknown[]) =>
  process.stderr.write("[worker-v2 warn] " + args.map(String).join(" ") + "\n");
const err = (...args: unknown[]) =>
  process.stderr.write("[worker-v2 error] " + args.map(String).join(" ") + "\n");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "worker-v2: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set",
  );
}
const VIDEOS_BUCKET = process.env.VIDEOS_BUCKET ?? "videos-public";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "10000");
const WORK_DIR = process.env.WORK_DIR ?? path.join(process.cwd(), "storage", "processed");

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface VideoOutputRow {
  id: string;
  script_id: string;
  take_id: string | null;
  status: string;
  client_slug: string | null;
}

interface VideoTakeRow {
  id: string;
  script_id: string;
  blob_path: string;
}

interface VideoScriptRow {
  id: string;
  body: string;
  platform: string | null;
}

interface VideoBrandRow {
  font_family: string;
  accent_color: string;
  editing_tier: string;
  logo_url: string | null;
}

/** Claim the oldest queued row by atomic conditional update. */
async function claimNextJob(): Promise<VideoOutputRow | null> {
  const { data: candidates, error } = await sb
    .from("video_output")
    .select("id, script_id, take_id, status, client_slug")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    err("query queued failed:", error.message);
    return null;
  }
  if (!candidates || candidates.length === 0) return null;
  const row = candidates[0] as VideoOutputRow;

  // Atomic claim: flip status='queued' -> 'editing'. If another worker (or a
  // manual edit) already moved it, the eq('status', 'queued') filter rejects
  // the update and we skip this row.
  const { data: claimed, error: claimErr } = await sb
    .from("video_output")
    .update({ status: "editing", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "queued")
    .select("id, script_id, take_id, status, client_slug")
    .maybeSingle();
  if (claimErr) {
    err("claim failed:", claimErr.message);
    return null;
  }
  return (claimed as VideoOutputRow) ?? null;
}

async function loadScript(scriptId: string): Promise<VideoScriptRow> {
  const { data, error } = await sb
    .from("video_script")
    .select("id, body, platform")
    .eq("id", scriptId)
    .single();
  if (error || !data) throw new Error(`script ${scriptId} not found: ${error?.message}`);
  return data as VideoScriptRow;
}

async function loadTake(takeId: string): Promise<VideoTakeRow> {
  const { data, error } = await sb
    .from("video_take")
    .select("id, script_id, blob_path")
    .eq("id", takeId)
    .single();
  if (error || !data) throw new Error(`take ${takeId} not found: ${error?.message}`);
  return data as VideoTakeRow;
}

async function loadBrand(clientSlug: string | null): Promise<VideoBrandRow> {
  const slug = clientSlug ?? "__internal__";
  const { data, error } = await sb
    .from("video_brand")
    .select("font_family, accent_color, editing_tier, logo_url")
    .eq("client_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`brand ${slug} lookup failed: ${error.message}`);
  return (
    (data as VideoBrandRow) ?? {
      font_family: "IBM Plex Sans",
      accent_color: "#87A6A6",
      editing_tier: "medium",
      logo_url: null,
    }
  );
}

async function downloadTakeBlob(blobPath: string, dest: string): Promise<void> {
  const { data, error } = await sb.storage.from(VIDEOS_BUCKET).download(blobPath);
  if (error || !data) throw new Error(`download ${blobPath} failed: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(dest, buf);
}

async function uploadOutput(outputId: string, localMp4: string): Promise<string> {
  const blob = await readFile(localMp4);
  const remotePath = `outputs/${outputId}.mp4`;
  const { error } = await sb.storage
    .from(VIDEOS_BUCKET)
    .upload(remotePath, blob, {
      contentType: "video/mp4",
      upsert: true,
    });
  if (error) throw new Error(`upload ${remotePath} failed: ${error.message}`);
  const { data } = sb.storage.from(VIDEOS_BUCKET).getPublicUrl(remotePath);
  return data.publicUrl;
}

async function markAwaitingApproval(
  outputId: string,
  publicUrl: string,
  outputPath: string,
): Promise<void> {
  const { error } = await sb
    .from("video_output")
    .update({
      status: "awaiting_approval",
      public_url: publicUrl,
      output_path: outputPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outputId);
  if (error) throw new Error(`mark awaiting_approval failed: ${error.message}`);
}

async function markError(outputId: string, message: string): Promise<void> {
  const { error } = await sb
    .from("video_output")
    .update({
      status: "error",
      error_log: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", outputId);
  if (error) err("markError write failed:", error.message);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the","a","an","is","are","was","were","be","been","being",
    "have","has","had","do","does","did","will","would","could",
    "should","may","might","shall","can","need","dare","ought",
    "used","to","of","in","for","on","with","at","by","from",
    "as","into","through","during","before","after","above","below",
    "between","out","off","over","under","again","further","then",
    "once","here","there","when","where","why","how","all","both",
    "each","few","more","most","other","some","such","no","nor",
    "not","only","own","same","so","than","too","very","just",
    "don","now","and","but","or","if","that","this","it","i",
    "you","he","she","we","they","me","him","her","us","them",
    "my","your","his","its","our","their","what","which","who",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

function reverseHex(hex: string): string {
  if (hex.length !== 6) return hex;
  return hex.slice(4, 6) + hex.slice(2, 4) + hex.slice(0, 2);
}

async function composeWithFFmpeg(opts: {
  basePath: string;
  srtPath: string;
  outputPath: string;
  brand: VideoBrandRow;
  workDir: string;
  scriptTitle: string;
}): Promise<void> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  const fontColor = "FFFFFF"; // text-hi default; brand.accent_color is overlay tone
  const { marginV, marginR, marginL } = SAFE_SUBTITLE_DEFAULTS;

  // ── Medium / Light path (default) ─────────────────────────────────────────
  if (opts.brand.editing_tier !== "heavy") {
    await execFileAsync(
      "ffmpeg",
      [
        "-i", opts.basePath,
        "-vf", `subtitles=${opts.srtPath}:force_style='FontName=${opts.brand.font_family},FontSize=24,PrimaryColour=&H${reverseHex(fontColor)}&,OutlineColour=&H80000000&,Outline=2,Shadow=0,Alignment=2,MarginV=${marginV},MarginR=${marginR},MarginL=${marginL}'`,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        opts.outputPath,
      ],
      { timeout: 300_000 },
    );
    return;
  }

  // ── Heavy path ─────────────────────────────────────────────────────────────
  // logo_url is required for heavy tier. Fall back to medium if missing.
  if (!opts.brand.logo_url) {
    warn("heavy tier requested but logo_url is null — falling back to medium render");
    await execFileAsync(
      "ffmpeg",
      [
        "-i", opts.basePath,
        "-vf", `subtitles=${opts.srtPath}:force_style='FontName=${opts.brand.font_family},FontSize=24,PrimaryColour=&H${reverseHex(fontColor)}&,OutlineColour=&H80000000&,Outline=2,Shadow=0,Alignment=2,MarginV=${marginV},MarginR=${marginR},MarginL=${marginL}'`,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        opts.outputPath,
      ],
      { timeout: 300_000 },
    );
    return;
  }

  // Download logo to a local temp file for FFmpeg input.
  const logoPath = path.join(opts.workDir, "logo.png");
  log("  downloading logo for heavy tier");
  await downloadFile(opts.brand.logo_url, logoPath);

  // Derive FFmpeg-compatible hex (0xBBGGRR) from brand accent color (#RRGGBB).
  const accentHex = opts.brand.accent_color.replace("#", "");
  const accentFFmpeg = "0x" + reverseHex(accentHex);

  // Frame dimensions (from safe-zones constants).
  const W = FRAME.WIDTH;   // 1080
  const H = FRAME.HEIGHT;  // 1920

  // Lower-third geometry:
  //   Sits above captions. Caption MarginV=320 means captions bottom-align at
  //   y = H - 320 = 1600. Leave an 8px gap above the caption line.
  const LT_HEIGHT = 80;
  const LT_Y = H - marginV - 8 - LT_HEIGHT; // 1512
  const LT_PAD = 24;

  // Escape the script title for FFmpeg drawtext (colons and commas must be escaped).
  const escapedTitle = opts.scriptTitle.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");
  const font = opts.brand.font_family.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");
  const handle = "@justinharris.ai";

  // ─── filter_complex description ──────────────────────────────────────────
  //
  // Inputs:
  //   [0] main footage (base.mp4, already 1080x1920)
  //   [1] logo image (logo.png)
  //
  // Segments built in filter_complex:
  //   [intro_v] — 2s black card with logo + accent line + title text
  //   [intro_a] — 2s silence
  //   [main_v]  — main footage with captions + lower-third overlay
  //   [main_a]  — main audio
  //   [outro_v] — 3s black card with logo + handle text
  //   [outro_a] — 3s silence
  //
  // Final: concat n=3 → [out_v][out_a]
  //
  // Fade transitions:
  //   intro → main: ffade out on intro last 0.4s + ffade in on main first 0.4s
  //   main → outro: ffade out on main last 0.4s + ffade in on outro first 0.5s
  //
  // Lower-third:
  //   drawbox full-width sage rectangle at LT_Y, then drawtext on top.
  //   Slide-in: x='-W+t/0.4*W' for t<0.4, x=0 for 0.4<=t<=4.1,
  //             x='-(t-4.1)/0.4*W' for t>4.1
  //   Implemented via overlay with enable + x expression.
  //   Since drawbox/drawtext can't translate as a unit, we render the bar onto
  //   a transparent overlay image via a separate lavfi source, then use overlay
  //   with x expression.
  //
  // Implementation note: drawbox + drawtext with x-slide is cleanest via
  // overlay of a separate padded clip. We use a color source (sage) scaled to
  // 1080x80, drawtext the label on it, then overlay it at (x_expr, LT_Y) on
  // the main footage with enable='between(t,0.5,4.5)'.

  const filterComplex = [
    // ── Logo scaling (shared by intro + outro) ───────────────────────────
    // Scale logo to fit within 200x200, preserving aspect ratio.
    `[1:v]scale=200:200:force_original_aspect_ratio=decrease,` +
    `pad=200:200:(ow-iw)/2:(oh-ih)/2:color=black@0[logo_scaled]`,

    // ── Intro card (2s) ──────────────────────────────────────────────────
    // Base: 2s black 1080x1920
    `color=black:size=${W}x${H}:duration=2:rate=30[intro_base]`,
    // Overlay logo top-center (y=200 from top, x centered)
    `[intro_base][logo_scaled]overlay=x=(${W}-200)/2:y=200[intro_logo]`,
    // Accent line below logo: thin rectangle 600px wide, 4px tall, centered
    `[intro_logo]drawbox=x=(${W}-600)/2:y=430:w=600:h=4:color=${accentFFmpeg}:t=fill[intro_line]`,
    // Title text centered below accent line
    `[intro_line]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:` +
    `text='${escapedTitle}':fontcolor=white:fontsize=48:` +
    `x=(w-text_w)/2:y=460[intro_v_raw]`,
    // Fade out last 0.4s of intro (starts at t=1.6s)
    `[intro_v_raw]fade=t=out:st=1.6:d=0.4[intro_v]`,
    // Silence for intro audio
    `aevalsrc=0:cl=stereo:duration=2:sample_rate=48000[intro_a]`,

    // ── Main footage: captions + lower-third ─────────────────────────────
    // Burn captions into main footage
    `[0:v]subtitles=${opts.srtPath}:force_style='FontName=${font},FontSize=24,` +
    `PrimaryColour=&H${reverseHex(fontColor)}&,OutlineColour=&H80000000&,` +
    `Outline=2,Shadow=0,Alignment=2,MarginV=${marginV},MarginR=${marginR},MarginL=${marginL}'[main_caps]`,
    // Lower-third: sage color bar (full-width, 80px tall)
    `color=${accentFFmpeg}:size=${W}x${LT_HEIGHT}:rate=30[lt_bar]`,
    // Draw text label on the bar
    `[lt_bar]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:` +
    `text='Justin Harris · AI Consulting':fontcolor=white:fontsize=28:` +
    `x=${LT_PAD}:y=(h-text_h)/2[lt_labeled]`,
    // Overlay bar on main, slide-in from left over 0.4s, slide-out last 0.4s.
    // x expression: before t=0.5 bar is off-screen left (-W),
    //   slides in from -W to 0 during [0.5, 0.9],
    //   holds at 0 during [0.9, 4.1],
    //   slides out from 0 to -W during [4.1, 4.5].
    `[main_caps][lt_labeled]overlay=` +
    `x='if(lt(t,0.5),-${W},if(lt(t,0.9),(t-0.5)/0.4*${W}-${W},if(gt(t,4.1),-(t-4.1)/0.4*${W},0)))':` +
    `y=${LT_Y}:enable='between(t,0.5,4.5)'[main_lt]`,
    // Fade in first 0.4s of main footage (bridges from intro black card).
    // No fade-out needed: the outro card fades in from black on its own side.
    `[main_lt]fade=t=in:st=0:d=0.4[main_v]`,
    `[0:a]acopy[main_a]`,

    // ── Outro card (3s) ──────────────────────────────────────────────────
    `color=black:size=${W}x${H}:duration=3:rate=30[outro_base]`,
    // Logo centered (vertically and horizontally)
    `[outro_base][logo_scaled]overlay=x=(${W}-200)/2:y=(${H}-200)/2-60[outro_logo]`,
    // Handle text below logo
    `[outro_logo]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:` +
    `text='${handle}':fontcolor=white:fontsize=24:` +
    `x=(w-text_w)/2:y=(${H})/2+80[outro_v_raw]`,
    // Fade in first 0.5s of outro (from main)
    `[outro_v_raw]fade=t=in:st=0:d=0.5[outro_v]`,
    // Silence for outro audio
    `aevalsrc=0:cl=stereo:duration=3:sample_rate=48000[outro_a]`,

    // ── Concat ───────────────────────────────────────────────────────────
    `[intro_v][intro_a][main_v][main_a][outro_v][outro_a]concat=n=3:v=1:a=1[out_v][out_a]`,
  ].join(";");

  log("  composing heavy-tier output (intro + lower-third + outro)");
  await execFileAsync(
    "ffmpeg",
    [
      "-i", opts.basePath,
      "-i", logoPath,
      "-filter_complex", filterComplex,
      "-map", "[out_v]",
      "-map", "[out_a]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      opts.outputPath,
    ],
    { timeout: 600_000 }, // heavier pipeline gets extra headroom
  );
}

async function processOne(row: VideoOutputRow): Promise<void> {
  const outputId = row.id;
  log(`processing video_output ${outputId} (script=${row.script_id})`);

  if (!row.take_id) throw new Error("video_output has no linked take_id");
  const take = await loadTake(row.take_id);
  const script = await loadScript(row.script_id);
  const brand = await loadBrand(row.client_slug);

  const workDir = path.join(WORK_DIR, outputId);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. Download take blob.
    const takeLocal = path.join(workDir, "take.webm");
    log("  downloading take blob");
    await downloadTakeBlob(take.blob_path, takeLocal);

    // 2. Transcode WebM -> MP4.
    log("  transcoding to mp4");
    const baseMp4 = path.join(workDir, "base.mp4");
    await transcodeToMP4(takeLocal, baseMp4);

    // 3. Extract audio + transcribe.
    log("  extracting audio + transcribing");
    const audioPath = path.join(workDir, "audio.wav");
    await extractAudio(baseMp4, audioPath);
    const segments = await transcribe(audioPath);
    const srtPath = path.join(workDir, "captions.srt");
    await writeFile(srtPath, segmentsToSRT(segments));

    // 4. Best-effort B-roll (light tier skips this; medium/heavy use it).
    if (brand.editing_tier !== "light") {
      log("  fetching b-roll");
      const keywords = extractKeywords(script.body);
      const brollResults = await searchBrollClips(keywords, 3);
      const brollDir = path.join(workDir, "broll");
      await mkdir(brollDir, { recursive: true });
      for (const clip of brollResults) {
        const clipPath = path.join(brollDir, `${clip.pexelsId}.mp4`);
        try {
          await downloadFile(clip.url, clipPath);
        } catch (e) {
          warn(`broll download failed for ${clip.pexelsId}:`, e);
        }
      }
    }

    // 5. Caption overlay (validated against safe zones first).
    log("  composing final mp4");
    validateSubtitleParams(SAFE_SUBTITLE_DEFAULTS);
    const finalMp4 = path.join(workDir, "final.mp4");
    await composeWithFFmpeg({
      basePath: baseMp4,
      srtPath,
      outputPath: finalMp4,
      brand,
      workDir,
      scriptTitle: script.body.split(/\s+/).slice(0, 8).join(" "),
    });

    // 6. Upload to videos-public/outputs/{id}.mp4 + flip row.
    log("  uploading output");
    const publicUrl = await uploadOutput(outputId, finalMp4);
    await markAwaitingApproval(outputId, publicUrl, `outputs/${outputId}.mp4`);
    log(`  done: ${publicUrl}`);

    // 7. Best-effort cleanup of the work dir.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`failed ${outputId}:`, msg);
    await markError(outputId, msg);
    throw e;
  }
}

let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      try {
        await processOne(job);
      } catch {
        // already logged + marked in processOne; keep the loop alive
      }
    } catch (e) {
      err("poll loop error:", e instanceof Error ? e.message : String(e));
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

process.on("SIGINT", () => {
  log("SIGINT — finishing current job, will exit after");
  stopping = true;
});
process.on("SIGTERM", () => {
  log("SIGTERM — finishing current job, will exit after");
  stopping = true;
});

log(`started; polling every ${POLL_INTERVAL_MS}ms; bucket=${VIDEOS_BUCKET}`);
loop().catch((e) => {
  err("fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
