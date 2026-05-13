"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";

interface VideoData {
  id: string;
  status: string;
  outputFilePath: string | null;
  inputFilePath: string;
  feedback: string | null;
  createdAt: string;
  script: { title: string; body: string; platform: string | null };
}

export default function ApprovePage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<VideoData | null>(null);
  const [feedback, setFeedback] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetch(`/api/videos/${videoId}`).then((r) => r.json()).then(setVideo);
  }, [videoId]);

  async function handleAction(action: string) {
    setActing(true);
    await fetch("/api/videos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action, feedback: feedback || undefined }),
    });
    // Refresh
    const updated = await fetch(`/api/videos/${videoId}`).then((r) => r.json());
    setVideo(updated);
    setFeedback("");
    setActing(false);
  }

  if (!video) {
    return <p className="text-foreground-secondary">Loading video...</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{video.script.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={video.status} />
            {video.script.platform && (
              <span className="text-xs text-foreground-secondary uppercase">{video.script.platform}</span>
            )}
            <span className="text-xs text-foreground-secondary">
              {new Date(video.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Video Preview */}
      <div className="bg-black aspect-video mb-6 flex items-center justify-center">
        {video.outputFilePath ? (
          <video
            src={`/api/media?path=${encodeURIComponent(video.outputFilePath)}`}
            controls
            className="w-full h-full"
          />
        ) : video.inputFilePath ? (
          <video
            src={`/api/media?path=${encodeURIComponent(video.inputFilePath)}`}
            controls
            className="w-full h-full"
          />
        ) : (
          <p className="text-white/50 text-sm">
            {video.status === "queued" || video.status === "transcribing" || video.status === "editing"
              ? "Video is being processed..."
              : "No preview available"}
          </p>
        )}
      </div>

      {/* Previous feedback */}
      {video.feedback && (
        <div className="bg-surface border border-border p-4 mb-4">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1">Previous Feedback</p>
          <p className="text-sm">{video.feedback}</p>
        </div>
      )}

      {/* Actions */}
      {(video.status === "awaiting_approval" || video.status === "error") && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => handleAction("approve")}
              disabled={acting}
              className="bg-success text-white px-6 py-2 text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50"
            >
              Approve & Post
            </button>
            <button
              onClick={() => handleAction("escalate")}
              disabled={acting}
              className="border border-border px-6 py-2 text-sm text-foreground-secondary hover:bg-black/5 transition-colors disabled:opacity-50"
            >
              Escalate to Human
            </button>
          </div>

          <div>
            <label htmlFor="feedback" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Feedback for re-edit
            </label>
            <div className="flex gap-2">
              <input
                id="feedback"
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder='e.g., "captions too big", "remove b-roll at 0:15"'
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => handleAction("feedback")}
                disabled={acting || !feedback.trim()}
                className="bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Re-edit
              </button>
            </div>
          </div>
        </div>
      )}

      {video.status === "approved" && (
        <div className="bg-success/10 border border-success/30 p-4 text-sm text-success">
          Video approved. It will be posted automatically via Metricool.
        </div>
      )}

      {video.status === "posted" && (
        <div className="bg-success/10 border border-success/30 p-4 text-sm text-success">
          Video has been posted successfully.
        </div>
      )}

      {(video.status === "queued" || video.status === "transcribing" || video.status === "editing") && (
        <div className="bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
          Video is being processed. This page will update when editing is complete.
        </div>
      )}

      {video.status === "human_review" && (
        <div className="bg-purple-100 border border-purple-300 p-4 text-sm text-purple-700">
          This video has been escalated for human review. Automation is paused.
        </div>
      )}

      {/* Script reference */}
      <div className="mt-8 bg-surface border border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-2">Original Script</p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{video.script.body}</p>
      </div>
    </div>
  );
}
