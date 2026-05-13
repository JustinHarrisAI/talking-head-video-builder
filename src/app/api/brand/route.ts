import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let brand = await prisma.brand.findFirst();
  if (!brand) {
    brand = await prisma.brand.create({
      data: { name: "Default" },
    });
  }
  return NextResponse.json(brand);
}

export async function PUT(req: NextRequest) {
  const data = await req.json();

  let brand = await prisma.brand.findFirst();
  if (!brand) {
    brand = await prisma.brand.create({ data: { name: "Default" } });
  }

  const updated = await prisma.brand.update({
    where: { id: brand.id },
    data: {
      name: data.name,
      fontHeadline: data.fontHeadline,
      fontBody: data.fontBody,
      accentColor: data.accentColor,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      editingTier: data.editingTier,
    },
  });

  return NextResponse.json(updated);
}
