import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await params;

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
  });

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const takes = await prisma.take.findMany({
    where: { scriptId },
    orderBy: { takeNumber: "asc" },
  });

  return NextResponse.json({ script, takes });
}
