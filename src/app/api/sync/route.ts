import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    // Dynamic import to avoid errors when Notion isn't configured
    const { fetchTodaysScripts } = await import("@/lib/notion");
    const scripts = await fetchTodaysScripts();

    let brand = await prisma.brand.findFirst();
    if (!brand) {
      brand = await prisma.brand.create({ data: { name: "Default" } });
    }

    let imported = 0;
    let skipped = 0;

    for (const script of scripts) {
      // Skip if already imported
      const existing = await prisma.script.findFirst({
        where: { notionPageId: script.notionPageId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.script.create({
        data: {
          brandId: brand.id,
          title: script.title,
          body: script.body,
          source: "notion",
          notionPageId: script.notionPageId,
          platform: script.platform,
          scheduledDate: script.scheduledDate,
        },
      });
      imported++;
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      total: scripts.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("not configured")) {
      return NextResponse.json(
        { ok: false, error: "Notion API not configured. Add NOTION_API_KEY and NOTION_CONTENT_DB to .env" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
