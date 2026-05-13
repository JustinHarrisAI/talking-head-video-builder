"use client";

import { useState, useEffect } from "react";

interface BrandData {
  id: string;
  name: string;
  fontHeadline: string;
  fontBody: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  editingTier: string;
}

export default function SettingsPage() {
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/brand").then((r) => r.json()).then(setBrand);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        fontHeadline: form.get("fontHeadline"),
        fontBody: form.get("fontBody"),
        accentColor: form.get("accentColor"),
        backgroundColor: form.get("backgroundColor"),
        textColor: form.get("textColor"),
        editingTier: form.get("editingTier"),
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setBrand(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (!brand) {
    return <p className="text-foreground-secondary">Loading settings...</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <h2 className="text-lg font-medium border-b border-border pb-2">Brand Settings</h2>

        <div>
          <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
            Brand Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={brand.name}
            className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fontHeadline" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Headline Font
            </label>
            <select
              id="fontHeadline"
              name="fontHeadline"
              defaultValue={brand.fontHeadline}
              className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option>IBM Plex Sans</option>
              <option>Inter</option>
              <option>DM Sans</option>
              <option>Space Grotesk</option>
              <option>Outfit</option>
              <option>Plus Jakarta Sans</option>
            </select>
          </div>
          <div>
            <label htmlFor="fontBody" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Body Font
            </label>
            <select
              id="fontBody"
              name="fontBody"
              defaultValue={brand.fontBody}
              className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option>IBM Plex Sans</option>
              <option>Inter</option>
              <option>DM Sans</option>
              <option>Space Grotesk</option>
              <option>Outfit</option>
              <option>Plus Jakarta Sans</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="accentColor" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Accent Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                id="accentColor"
                name="accentColor"
                type="color"
                defaultValue={brand.accentColor}
                className="w-10 h-10 border border-border cursor-pointer"
              />
              <input
                type="text"
                defaultValue={brand.accentColor}
                readOnly
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground-secondary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="backgroundColor" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Background
            </label>
            <div className="flex gap-2 items-center">
              <input
                id="backgroundColor"
                name="backgroundColor"
                type="color"
                defaultValue={brand.backgroundColor}
                className="w-10 h-10 border border-border cursor-pointer"
              />
              <input
                type="text"
                defaultValue={brand.backgroundColor}
                readOnly
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground-secondary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="textColor" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
              Text Color
            </label>
            <div className="flex gap-2 items-center">
              <input
                id="textColor"
                name="textColor"
                type="color"
                defaultValue={brand.textColor}
                className="w-10 h-10 border border-border cursor-pointer"
              />
              <input
                type="text"
                defaultValue={brand.textColor}
                readOnly
                className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground-secondary"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="editingTier" className="block text-xs font-medium uppercase tracking-wider text-foreground-secondary mb-1.5">
            Editing Complexity
          </label>
          <select
            id="editingTier"
            name="editingTier"
            defaultValue={brand.editingTier}
            className="w-full bg-surface border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent"
          >
            <option value="hyper_simple">Hyper Simple — Text fade-in, minimal overlays</option>
            <option value="medium">Medium — Kinetic text, subtle zoom, B-roll inserts</option>
            <option value="high">High — Motion graphics, sound effects, dynamic transitions</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white px-6 py-2 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {saved && <span className="text-sm text-success">Saved</span>}
        </div>
      </form>

      <div className="mt-12 space-y-6">
        <h2 className="text-lg font-medium border-b border-border pb-2">API Connections</h2>
        <p className="text-sm text-foreground-secondary">
          Configure your Notion, Metricool, and Pexels API keys. These are stored in your .env file on the server.
        </p>
        <div className="bg-surface border border-border p-4 text-sm font-mono text-foreground-secondary">
          <p>NOTION_API_KEY=your_key_here</p>
          <p>NOTION_CONTENT_DB=your_database_id</p>
          <p>METRICOOL_USER_ID=your_user_id</p>
          <p>METRICOOL_BLOG_ID=your_blog_id</p>
          <p>PEXELS_API_KEY=your_key_here</p>
        </div>
      </div>
    </div>
  );
}
