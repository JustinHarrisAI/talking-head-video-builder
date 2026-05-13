"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewScriptPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        body: form.get("body"),
        platform: form.get("platform") || null,
        scheduledDate: form.get("scheduledDate") || null,
      }),
    });

    if (res.ok) {
      const script = await res.json();
      router.push(`/record/${script.id}`);
    } else {
      setSaving(false);
      alert("Failed to create script");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">New Script</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g., Why AI Consultants Need Systems"
            className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="body" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
            Script
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={12}
            placeholder="Write your script here. This will be displayed while you record..."
            className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="platform" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Platform (optional)
            </label>
            <select
              id="platform"
              name="platform"
              className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Any</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
          <div>
            <label htmlFor="scheduledDate" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Schedule Date (optional)
            </label>
            <input
              id="scheduledDate"
              name="scheduledDate"
              type="date"
              className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white px-6 py-2 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create & Record"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-border px-6 py-2 text-sm text-foreground-secondary hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
