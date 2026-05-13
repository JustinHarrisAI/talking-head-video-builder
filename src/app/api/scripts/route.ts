import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const scripts = await prisma.script.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { takes: true, videos: true } } },
  });
  return NextResponse.json(scripts);
}

export async function POST(req: NextRequest) {
  const data = await req.json();

  // Get or create default brand
  let brand = await prisma.brand.findFirst();
  if (!brand) {
    brand = await prisma.brand.create({
      data: { name: "Default" },
    });
  }

  const script = await prisma.script.create({
    data: {
      brandId: brand.id,
      title: data.title,
      body: data.body,
      platform: data.platform || null,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
    },
  });

  return NextResponse.json(script, { status: 201 });
}
