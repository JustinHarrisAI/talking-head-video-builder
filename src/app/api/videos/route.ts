import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { videoQueue, postQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const { scriptId } = await req.json();

  const selectedTake = await prisma.take.findFirst({
    where: { scriptId, selected: true },
  });
  if (!selectedTake) {
    return NextResponse.json({ error: "No take selected for this script" }, { status: 400 });
  }

  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const video = await prisma.video.create({
    data: {
      scriptId,
      brandId: script.brandId,
      inputFilePath: selectedTake.filePath,
      status: "queued",
    },
  });

  await prisma.script.update({
    where: { id: scriptId },
    data: { status: "processing" },
  });

  await prisma.job.create({
    data: {
      videoId: video.id,
      type: "transcribe",
      status: "queued",
    },
  });

  // Queue the video processing job
  await videoQueue.add("process", { videoId: video.id }, {
    jobId: `process-${video.id}`,
  });

  return NextResponse.json(video, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { videoId, action, feedback } = await req.json();

  if (action === "approve") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "approved" },
    });

    // Queue the posting job
    await postQueue.add("post", { videoId }, {
      jobId: `post-${videoId}`,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "feedback") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "queued", feedback },
    });

    await prisma.job.create({
      data: {
        videoId,
        type: "re_edit",
        status: "queued",
        payload: JSON.stringify({ feedback }),
      },
    });

    // Re-queue for processing
    await videoQueue.add("process", { videoId }, {
      jobId: `reprocess-${videoId}-${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "escalate") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "human_review" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
