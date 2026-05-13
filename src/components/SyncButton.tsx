"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setResult(null);

    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json();

    if (data.ok) {
      setResult(`Imported ${data.imported}, skipped ${data.skipped}`);
      router.refresh();
    } else {
      setResult(data.error || "Sync failed");
    }

    setSyncing(false);
    setTimeout(() => setResult(null), 4000);
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-xs text-foreground-secondary">{result}</span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="border border-border px-3 py-2 text-sm text-foreground-secondary hover:bg-black/5 transition-colors disabled:opacity-50"
      >
        {syncing ? "Syncing..." : "Sync Notion"}
      </button>
    </div>
  );
}
