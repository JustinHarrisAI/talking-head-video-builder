"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/scripts", label: "Scripts", icon: "file-text" },
  { href: "/library", label: "Library", icon: "film" },
  { href: "/settings", label: "Settings", icon: "sliders" },
];

const icons: Record<string, React.ReactNode> = {
  grid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  "file-text": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  film: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  ),
  sliders: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-surface border-r border-border flex flex-col h-full">
      <div className="p-5 border-b border-border">
        <h1 className="text-lg font-medium tracking-tight">Video Builder</h1>
        <p className="text-xs text-foreground-secondary mt-0.5">Talking Head Studio</p>
      </div>
      <nav className="flex-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-foreground-secondary hover:text-foreground hover:bg-black/5"
              }`}
            >
              {icons[item.icon]}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <svg width="20" height="20" viewBox="0 0 321.88 313.41" aria-label="JustinHarris.AI logo">
            <rect fill="#222" width="321.88" height="313.41" />
            <path fill="#fff" d="M197.39,92.22c.14-.27.14-.67,0-.81s-.55-.27-.82-.13l-2.58,1.47-21.74,12.36v37.08l-8.29,4.7v-37.07l-13.17,7.53c-5.3,2.96-8.55,8.59-8.55,14.65v65.16l-8.29,4.7v-37.75l-13.17,7.53c-5.3,2.96-8.55,8.59-8.55,14.65v19.35c0,4.3-.94,8.59-2.99,12.62l-1.49,3.08c0,.13,0,.54.27.67.27.13.55.27.82.13l3.4-2.01,51.62-29.55v-37.62l8.29-4.7v37.75l13.17-7.53c5.3-2.96,8.55-8.59,8.55-14.65v-61.53c.14-3.62,1.23-7.12,3.53-10.07h0Z" />
          </svg>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-foreground-secondary">Powered by</p>
            <p className="text-xs font-medium text-foreground">JustinHarris.AI</p>
          </div>
        </div>
        <p className="text-[10px] text-foreground-secondary leading-relaxed">
          &copy; 2026 Justin Harris AI Consulting.
          All rights reserved. Proprietary software.
        </p>
        <p className="text-[10px] text-foreground-secondary mt-0.5">v0.1.0</p>
      </div>
    </aside>
  );
}
