import { Worker, Job } from "bullmq";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { schedulePost } from "../lib/metricool";
import IORedis from "ioredis";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set in worker env");
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

interface PostJobData {
  videoId: string;
}

const worker = new Worker<PostJobData>(
  "social-posting",
  async (job: Job<PostJobData>) => {
    const { videoId } = job.data;
    console.log(`[post-worker] Posting video ${videoId}`);

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { script: true },
    });

    if (!video) throw new Error(`Video ${videoId} not found`);
    if (!video.outputFilePath) throw new Error("No output file to post");

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "posting" },
    });

    try {
      // Determine platforms from script metadata
      const platforms = video.script.platform
        ? [video.script.platform]
        : ["instagram", "tiktok", "linkedin"];

      // The video file needs to be accessible via URL for Metricool
      // For local dev, we'd need to expose the file via a public URL
      // In production, this would be uploaded to cloud storage first
      const videoUrl = `${process.env.APP_URL || "http://localhost:3004"}/api/media?path=${encodeURIComponent(video.outputFilePath)}`;

      const result = await schedulePost({
        text: video.script.title,
        mediaUrl: videoUrl,
        platforms,
        scheduledDate: video.script.scheduledDate || undefined,
      });

      if (result.success) {
        await prisma.video.update({
          where: { id: videoId },
          data: {
            status: "posted",
            metricoolPostId: result.postId,
            postedAt: new Date(),
          },
        });

        // Update script status
        await prisma.script.update({
          where: { id: video.scriptId },
          data: { status: "posted" },
        });

        console.log(`[post-worker] Video ${videoId} posted successfully`);
      } else {
        throw new Error(result.error || "Unknown posting error");
      }
    } catch (err) {
      console.error(`[post-worker] Failed to post video ${videoId}:`, err);

      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: "not_posted_error",
          errorLog: err instanceof Error ? err.message : String(err),
        },
      });

      throw err;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`[post-worker] Job ${job.id} completed for video ${job.data.videoId}`);
});

worker.on("failed", (job, err) => {
  console.error(`[post-worker] Job ${job?.id} failed:`, err.message);
});

console.log("[post-worker] Social posting worker started");

export default worker;
