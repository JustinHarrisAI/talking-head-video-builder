import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  // Security: only serve files from our storage directory
  const storageRoot = process.cwd() + "/storage";
  if (!filePath.startsWith(storageRoot)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    webm: "video/webm",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeTypes[ext || ""] || "application/octet-stream",
      "Content-Length": buffer.length.toString(),
    },
  });
}
