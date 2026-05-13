import Link from "next/link";
import { prisma } from "@/lib/db";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const scripts = await prisma.script.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { takes: true, videos: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Scripts</h1>
        <Link
          href="/scripts/new"
          className="bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          + New Script
        </Link>
      </div>

      {scripts.length === 0 ? (
        <div className="bg-surface border border-border p-12 text-center">
          <p className="text-foreground-secondary mb-3">No scripts yet.</p>
          <Link href="/scripts/new" className="text-accent text-sm hover:underline">
            Create your first script
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => (
            <div
              key={script.id}
              className="flex items-center justify-between bg-surface border border-border p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{script.title}</p>
                <p className="text-sm text-foreground-secondary truncate mt-0.5">
                  {script.body.slice(0, 150)}
                </p>
                <div className="flex gap-4 mt-2 text-xs text-foreground-secondary">
                  <span>{script._count.takes} take{script._count.takes !== 1 ? "s" : ""}</span>
                  <span>{script._count.videos} video{script._count.videos !== 1 ? "s" : ""}</span>
                  {script.platform && <span className="uppercase">{script.platform}</span>}
                  {script.scheduledDate && (
                    <span>{new Date(script.scheduledDate).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <StatusBadge status={script.status} />
                <Link
                  href={`/record/${script.id}`}
                  className="bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent/90 transition-colors"
                >
                  Record
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
