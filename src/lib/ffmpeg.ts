import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";

export async function extractAudio(videoPath: string, outputPath?: string): Promise<string> {
  const out = outputPath || videoPath.replace(path.extname(videoPath), ".wav");
  await execFileAsync(FFMPEG, [
    "-i", videoPath,
    "-vn",                    // no video
    "-acodec", "pcm_s16le",  // WAV format (whisper.cpp needs this)
    "-ar", "16000",           // 16kHz sample rate
    "-ac", "1",               // mono
    "-y",                     // overwrite
    out,
  ], { timeout: 120000 });
  return out;
}

export async function transcodeToMP4(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(FFMPEG, [
    "-i", inputPath,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "-y",
    outputPath,
  ], { timeout: 300000 });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    videoPath,
  ]);
  return parseFloat(stdout.trim());
}

export async function trimSilence(
  inputPath: string,
  outputPath: string,
  startTrim = 0.5,
  endTrim = 0.5
): Promise<void> {
  const duration = await getVideoDuration(inputPath);
  const trimmedDuration = duration - startTrim - endTrim;

  if (trimmedDuration <= 0) {
    // File too short to trim, just copy
    await execFileAsync(FFMPEG, ["-i", inputPath, "-c", "copy", "-y", outputPath], { timeout: 60000 });
    return;
  }

  await execFileAsync(FFMPEG, [
    "-i", inputPath,
    "-ss", String(startTrim),
    "-t", String(trimmedDuration),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y",
    outputPath,
  ], { timeout: 300000 });
}

export async function downloadFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import("fs/promises");
  await writeFile(outputPath, buffer);
}
