import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const scriptId = formData.get("scriptId") as string;
  const video = formData.get("video") as File;

  if (!scriptId || !video) {
    return NextResponse.json({ error: "scriptId and video are required" }, { status: 400 });
  }

  // Count existing takes for this script
  const takeCount = await prisma.take.count({ where: { scriptId } });
  const takeNumber = takeCount + 1;

  // Save file
  const storageDir = path.join(process.cwd(), "storage", "takes", scriptId);
  await mkdir(storageDir, { recursive: true });
  const fileName = `take-${takeNumber}-${Date.now()}.webm`;
  const filePath = path.join(storageDir, fileName);
  const buffer = Buffer.from(await video.arrayBuffer());
  await writeFile(filePath, buffer);

  // Create take record
  const take = await prisma.take.create({
    data: {
      scriptId,
      filePath,
      takeNumber,
    },
  });

  // Update script status
  await prisma.script.update({
    where: { id: scriptId },
    data: { status: "recording" },
  });

  return NextResponse.json(take, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { takeId, action } = await req.json();

  if (action === "select") {
    const take = await prisma.take.findUnique({ where: { id: takeId } });
    if (!take) return NextResponse.json({ error: "Take not found" }, { status: 404 });

    // Deselect all takes for this script, select this one
    await prisma.take.updateMany({
      where: { scriptId: take.scriptId },
      data: { selected: false },
    });
    await prisma.take.update({
      where: { id: takeId },
      data: { selected: true },
    });

    // Update script status
    await prisma.script.update({
      where: { id: take.scriptId },
      data: { status: "recorded" },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const take = await prisma.take.findUnique({ where: { id: takeId } });
    if (!take) return NextResponse.json({ error: "Take not found" }, { status: 404 });

    // Delete file
    try {
      await unlink(take.filePath);
    } catch {
      // File may not exist
    }

    await prisma.take.delete({ where: { id: takeId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
