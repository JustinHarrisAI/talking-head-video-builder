import { Worker, Job } from "bullmq";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import path from "path";
import { mkdir } from "fs/promises";
import { extractAudio, transcodeToMP4, downloadFile } from "../lib/ffmpeg";
import { transcribe, segmentsToSRT } from "../lib/whisper";
import { searchBrollClips } from "../lib/pexels";
import { validateSubtitleParams, SAFE_SUBTITLE_DEFAULTS, SafeZoneViolation } from "../lib/safe-zones";
import { writeFile } from "fs/promises";
import IORedis from "ioredis";

const log = (...args: unknown[]) => process.stdout.write(args.map(String).join(" ") + "\n");
const warn = (...args: unknown[]) => process.stderr.write("[warn] " + args.map(String).join(" ") + "\n");
const err = (...args: unknown[]) => process.stderr.write("[error] " + args.map(String).join(" ") + "\n");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set in worker env");
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const connection = new IORedis({
  host: REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
  maxRetriesPerRequest: null,
});

interface VideoJobData {
  videoId: string;
}

async function updateVideoStatus(videoId: string, status: string, extra?: Record<string, unknown>) {
  await prisma.video.update({
    where: { id: videoId },
    data: { status, ...extra },
  });
}

async function updateJobStatus(videoId: string, type: string, status: string, extra?: Record<string, unknown>) {
  const job = await prisma.job.findFirst({
    where: { videoId, type },
    orderBy: { createdAt: "desc" },
  });
  if (job) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status, ...extra },
    });
  }
}

const worker = new Worker<VideoJobData>(
  "video-processing",
  async (job: Job<VideoJobData>) => {
    const { videoId } = job.data;
    log(`[worker] Processing video ${videoId}`);

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { script: true, brand: true },
    });

    if (!video) throw new Error(`Video ${videoId} not found`);

    const processedDir = path.join(process.cwd(), "storage", "processed", videoId);
    await mkdir(processedDir, { recursive: true });

    try {
      // ── Step 1: Transcode raw video to MP4 ──
      log(`[worker] Step 1: Transcoding ${videoId}`);
      await updateVideoStatus(videoId, "transcribing");

      const mp4Path = path.join(processedDir, "base.mp4");
      await transcodeToMP4(video.inputFilePath, mp4Path);

      // ── Step 2: Extract audio and transcribe ──
      log(`[worker] Step 2: Extracting audio & transcribing ${videoId}`);
      const audioPath = path.join(processedDir, "audio.wav");
      await extractAudio(mp4Path, audioPath);

      const segments = await transcribe(audioPath);
      const srtContent = segmentsToSRT(segments);
      const srtPath = path.join(processedDir, "captions.srt");
      await writeFile(srtPath, srtContent);

      log(`[worker] Transcribed ${segments.length} segments for ${videoId}`);

      // ── Step 3: Fetch B-roll clips ──
      log(`[worker] Step 3: Fetching B-roll for ${videoId}`);
      await updateVideoStatus(videoId, "editing");

      // Extract keywords from script
      const keywords = extractKeywords(video.script.body);
      const brollResults = await searchBrollClips(keywords, 3);

      // Download B-roll clips
      const brollDir = path.join(processedDir, "broll");
      await mkdir(brollDir, { recursive: true });

      const brollPaths: string[] = [];
      for (const clip of brollResults) {
        const clipPath = path.join(brollDir, `${clip.pexelsId}.mp4`);
        try {
          await downloadFile(clip.url, clipPath);
          brollPaths.push(clipPath);
        } catch (e) {
          warn(`[worker] Failed to download B-roll ${clip.pexelsId}:`, e);
        }
      }

      // ── Step 4: Compose final video with FFmpeg ──
      log(`[worker] Step 4: Composing final video for ${videoId}`);

      // Pre-flight: validate subtitle params against platform safe zones before
      // passing to FFmpeg. Throws SafeZoneViolation if margins would land captions
      // inside the action bar / Dynamic Island zones. Job fails here, not after posting.
      validateSubtitleParams(SAFE_SUBTITLE_DEFAULTS);

      const outputPath = path.join(processedDir, "final.mp4");
      await composeWithFFmpeg({
        basePath: mp4Path,
        srtPath,
        outputPath,
        brand: video.brand,
      });

      // ── Step 5: Update status ──
      await updateVideoStatus(videoId, "awaiting_approval", {
        outputFilePath: outputPath,
        captionFilePath: srtPath,
        editParams: JSON.stringify({
          segments: segments.length,
          brollClips: brollPaths.length,
          keywords,
          editingTier: video.brand.editingTier,
        }),
      });

      await updateJobStatus(videoId, "transcribe", "completed", {
        result: JSON.stringify({ segments: segments.length }),
        endedAt: new Date(),
      });

      log(`[worker] Video ${videoId} ready for approval`);
    } catch (e) {
      err(`[worker] Failed processing video ${videoId}:`, e);
      await updateVideoStatus(videoId, "error", {
        errorLog: e instanceof Error ? e.message : String(e),
      });
      await updateJobStatus(videoId, "transcribe", "failed", {
        errorLog: e instanceof Error ? e.message : String(e),
        endedAt: new Date(),
      });
      throw e;
    }
  },
  {
    connection,
    concurrency: 1, // process one video at a time to avoid overloading Mac Mini
  }
);

worker.on("completed", (job) => {
  log(`[worker] Job ${job.id} completed for video ${job.data.videoId}`);
});

worker.on("failed", (job, e) => {
  err(`[worker] Job ${job?.id} failed:`, e.message);
});

// ── Helper: Extract keywords from script text ──
function extractKeywords(text: string): string[] {
  // Simple keyword extraction: find nouns/key phrases
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "don", "now", "and", "but", "or", "if", "that", "this", "it", "i",
    "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "what", "which", "who",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Count frequency and return top 5
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

// ── Helper: Compose video with FFmpeg (caption overlay) ──
async function composeWithFFmpeg(opts: {
  basePath: string;
  srtPath: string;
  outputPath: string;
  brand: { fontBody: string; accentColor: string; textColor: string };
}): Promise<void> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const fontColor = opts.brand.textColor.replace("#", "");
  const outlineColor = "000000";

  // Use SAFE_SUBTITLE_DEFAULTS for all margins — these are validated against
  // platform safe zones (Instagram, TikTok, YouTube Shorts, iPhone Dynamic Island).
  // Do NOT change these values without running validateSubtitleParams() first.
  const { marginV, marginR, marginL } = SAFE_SUBTITLE_DEFAULTS;

  await execFileAsync("ffmpeg", [
    "-i", opts.basePath,
    "-vf", `subtitles=${opts.srtPath}:force_style='FontName=${opts.brand.fontBody},FontSize=24,PrimaryColour=&H${reverseHex(fontColor)}&,OutlineColour=&H80${reverseHex(outlineColor)}&,Outline=2,Shadow=0,Alignment=2,MarginV=${marginV},MarginR=${marginR},MarginL=${marginL}'`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    opts.outputPath,
  ], { timeout: 300000 });
}

// FFmpeg uses BBGGRR format for colors (reversed hex)
function reverseHex(hex: string): string {
  if (hex.length !== 6) return hex;
  return hex.slice(4, 6) + hex.slice(2, 4) + hex.slice(0, 2);
}

log("[worker] Video processing worker started");

export default worker;
