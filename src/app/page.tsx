import Link from "next/link";
import { prisma } from "@/lib/db";
import StatusBadge from "@/components/StatusBadge";
import SyncButton from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [scripts, recentVideos, stats] = await Promise.all([
    prisma.script.findMany({
      where: {
        OR: [
          { scheduledDate: { gte: todayStart, lte: todayEnd } },
          { status: { in: ["pending", "recording"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.video.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { script: true },
    }),
    Promise.all([
      prisma.script.count({ where: { scheduledDate: { gte: todayStart, lte: todayEnd } } }),
      prisma.video.count({ where: { status: "awaiting_approval" } }),
      prisma.video.count({ where: { status: { in: ["queued", "transcribing", "editing"] } } }),
      prisma.video.count({ where: { status: "posted" } }),
    ]),
  ]);

  const [todayScripts, awaitingApproval, processing, totalPosted] = stats;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-foreground-secondary mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton />
          <Link
            href="/scripts/new"
            className="bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            + New Script
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Today's Scripts", value: todayScripts },
          { label: "Awaiting Review", value: awaitingApproval },
          { label: "Processing", value: processing },
          { label: "Total Posted", value: totalPosted },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">{stat.label}</p>
            <p className="text-3xl font-semibold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Today's Scripts */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Today&apos;s Scripts</h2>
          <Link href="/scripts" className="text-sm text-accent hover:underline">View all</Link>
        </div>
        {scripts.length === 0 ? (
          <div className="bg-surface border border-border p-8 text-center">
            <p className="text-foreground-secondary">No scripts for today.</p>
            <Link href="/scripts/new" className="text-accent text-sm hover:underline mt-2 inline-block">
              Create one
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {scripts.map((script) => (
              <Link
                key={script.id}
                href={`/record/${script.id}`}
                className="flex items-center justify-between bg-surface border border-border p-4 hover:border-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{script.title}</p>
                  <p className="text-sm text-foreground-secondary truncate mt-0.5">
                    {script.body.length > 120 ? script.body.slice(0, 120) + "..." : script.body}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {script.platform && (
                    <span className="text-xs text-foreground-secondary uppercase">{script.platform}</span>
                  )}
                  <StatusBadge status={script.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Videos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Recent Videos</h2>
          <Link href="/library" className="text-sm text-accent hover:underline">View all</Link>
        </div>
        {recentVideos.length === 0 ? (
          <div className="bg-surface border border-border p-8 text-center">
            <p className="text-foreground-secondary">No videos yet. Record your first take!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentVideos.map((video) => (
              <Link
                key={video.id}
                href={`/approve/${video.id}`}
                className="flex items-center justify-between bg-surface border border-border p-4 hover:border-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{video.script.title}</p>
                  <p className="text-xs text-foreground-secondary mt-0.5">
                    {new Date(video.createdAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={video.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
