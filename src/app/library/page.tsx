import Link from "next/link";
import { prisma } from "@/lib/db";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    include: { script: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Video Library</h1>

      {videos.length === 0 ? (
        <div className="bg-surface border border-border p-12 text-center">
          <p className="text-foreground-secondary mb-3">No videos yet.</p>
          <Link href="/scripts" className="text-accent text-sm hover:underline">
            Go record some takes
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/approve/${video.id}`}
              className="flex items-center justify-between bg-surface border border-border p-4 hover:border-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{video.script.title}</p>
                <div className="flex gap-4 mt-1 text-xs text-foreground-secondary">
                  <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                  {video.script.platform && (
                    <span className="uppercase">{video.script.platform}</span>
                  )}
                  {video.postedAt && (
                    <span>Posted {new Date(video.postedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <StatusBadge status={video.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
