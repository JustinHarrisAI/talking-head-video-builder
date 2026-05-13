import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// whisper.cpp binary location - install via: brew install whisper-cpp
// or build from source: https://github.com/ggml-org/whisper.cpp
const WHISPER_BIN = process.env.WHISPER_BIN || "/opt/homebrew/bin/whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || path.join(process.cwd(), "models", "ggml-base.en.bin");

export interface WhisperSegment {
  start: number; // milliseconds
  end: number;
  text: string;
}

export async function transcribe(audioPath: string): Promise<WhisperSegment[]> {
  if (!existsSync(WHISPER_BIN)) {
    console.warn("whisper-cpp not found at", WHISPER_BIN, "- using fallback Web Speech API approach");
    return [];
  }

  if (!existsSync(WHISPER_MODEL)) {
    console.warn("whisper model not found at", WHISPER_MODEL);
    return [];
  }

  const outputBase = audioPath.replace(path.extname(audioPath), "");

  try {
    await execFileAsync(WHISPER_BIN, [
      "-m", WHISPER_MODEL,
      "-f", audioPath,
      "-osrt",
      "-of", outputBase,
      "--output-json",
      "-pp", // print progress
    ], { timeout: 300000 }); // 5 min timeout

    // Parse the JSON output
    const jsonPath = outputBase + ".json";
    if (existsSync(jsonPath)) {
      const { readFile } = await import("fs/promises");
      const raw = await readFile(jsonPath, "utf-8");
      const data = JSON.parse(raw);

      if (data.transcription) {
        return data.transcription.map((seg: { timestamps: { from: string; to: string }; text: string }) => ({
          start: parseTimestamp(seg.timestamps.from),
          end: parseTimestamp(seg.timestamps.to),
          text: seg.text.trim(),
        }));
      }
    }

    // Fallback: parse SRT
    const srtPath = outputBase + ".srt";
    if (existsSync(srtPath)) {
      const { readFile } = await import("fs/promises");
      const srt = await readFile(srtPath, "utf-8");
      return parseSRT(srt);
    }

    return [];
  } catch (err) {
    console.error("whisper transcription failed:", err);
    return [];
  }
}

function parseTimestamp(ts: string): number {
  // Format: "HH:MM:SS.mmm" or "00:00:05.320"
  const parts = ts.split(":");
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const secMs = parts[2].split(".");
  const seconds = parseInt(secMs[0]);
  const ms = parseInt(secMs[1] || "0");
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

function parseSRT(srt: string): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  const blocks = srt.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!match) continue;

    const start = parseSRTTimestamp(match[1]);
    const end = parseSRTTimestamp(match[2]);
    const text = lines.slice(2).join(" ").trim();

    segments.push({ start, end, text });
  }

  return segments;
}

function parseSRTTimestamp(ts: string): number {
  const [time, ms] = ts.split(",");
  const parts = time.split(":");
  return (
    (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000 +
    parseInt(ms)
  );
}

export function segmentsToSRT(segments: WhisperSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = msToSRTTime(seg.start);
      const end = msToSRTTime(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join("\n\n");
}

function msToSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
