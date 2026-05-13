/**
 * safe-zones.ts — Platform Safe Zone Enforcement for 9:16 Video (1080x1920)
 *
 * Throws hard errors when any video element is placed in a platform UI keep-out
 * zone. Not advisory — violations crash the job before FFmpeg or Remotion runs.
 *
 * Why this exists: On 2026-04-11, a terminal overlay landed in the iPhone
 * Dynamic Island zone at top, and captions (MarginV=60) landed inside the
 * Instagram/TikTok action bar zone at bottom. Problem only appeared after posting.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const FRAME = {
  WIDTH: 1080,
  HEIGHT: 1920,
} as const;

/** Keep-out zones in pixels. Any element touching these regions violates a platform boundary. */
export const KEEP_OUT = {
  TOP: 130,    // Dynamic Island (iPhone 14 Pro+) + status bar + platform profile headers
  BOTTOM: 300, // Username / caption / audio bar / action buttons
  LEFT: 50,    // Edge buffer
  RIGHT: 150,  // Action button column (like, comment, share, follow)
} as const;

/** Derived safe zone pixel boundaries. */
export const SAFE_ZONE = {
  x_min: KEEP_OUT.LEFT,
  x_max: FRAME.WIDTH - KEEP_OUT.RIGHT,   // 930
  y_min: KEEP_OUT.TOP,                   // 130
  y_max: FRAME.HEIGHT - KEEP_OUT.BOTTOM, // 1620
} as const;

/** Tighter zone for important text: titles, lower thirds, CTAs. */
export const CRITICAL_TEXT_ZONE = {
  x_min: 80,
  x_max: 900,
  y_min: 200,
  y_max: 1520,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class SafeZoneViolation extends Error {
  public readonly elementName: string;
  public readonly violations: string[];

  constructor(elementName: string, violations: string[]) {
    const message = [
      ``,
      `╔══════════════════════════════════════════════════════════╗`,
      `║           SAFE ZONE VIOLATION — RENDER BLOCKED           ║`,
      `╚══════════════════════════════════════════════════════════╝`,
      ``,
      `Element: "${elementName}"`,
      ``,
      ...violations.map((v, i) => `  ${i + 1}. ${v}`),
      ``,
      `Platform context:`,
      `  Top ${KEEP_OUT.TOP}px    → Dynamic Island (iPhone 14 Pro+) + status bar + profile header`,
      `  Bottom ${KEEP_OUT.BOTTOM}px → Username, caption, audio attribution, like/comment/share`,
      `  Right ${KEEP_OUT.RIGHT}px  → Action button column (TikTok/Reels/Shorts)`,
      `  Left ${KEEP_OUT.LEFT}px    → Edge buffer`,
      ``,
      `Fix: Move the element inside the safe zone:`,
      `  x: ${SAFE_ZONE.x_min}–${SAFE_ZONE.x_max}px`,
      `  y: ${SAFE_ZONE.y_min}–${SAFE_ZONE.y_max}px`,
      ``,
    ].join('\n');

    super(message);
    this.name = 'SafeZoneViolation';
    this.elementName = elementName;
    this.violations = violations;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

interface ElementValidationOptions {
  /** Apply the tighter critical text zone instead of the standard safe zone. */
  critical?: boolean;
  /** Skip validation (e.g. for full-bleed background video layers). */
  isBackground?: boolean;
}

interface ElementResult {
  valid: true;
  element: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zone: 'safe' | 'critical';
}

/**
 * Validate a single element's bounding box against the safe zone.
 * Throws SafeZoneViolation if any edge is in a keep-out zone.
 */
export function validateElement(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: ElementValidationOptions = {}
): ElementResult {
  if (options.isBackground) {
    return { valid: true, element: name, x, y, width, height, zone: 'safe' };
  }

  const zone = options.critical ? CRITICAL_TEXT_ZONE : SAFE_ZONE;
  const violations: string[] = [];
  const right = x + width;
  const bottom = y + height;

  if (y < zone.y_min) {
    violations.push(
      `TOP VIOLATION: "${name}" top edge is at y=${y}px — must be >= ${zone.y_min}px` +
      (y < KEEP_OUT.TOP
        ? ` (inside Dynamic Island / platform header zone)`
        : ` (inside critical text keep-out)`)
    );
  }
  if (bottom > zone.y_max) {
    violations.push(
      `BOTTOM VIOLATION: "${name}" bottom edge is at y=${bottom}px (top=${y} + height=${height}) — must be <= ${zone.y_max}px` +
      (bottom > FRAME.HEIGHT - KEEP_OUT.BOTTOM
        ? ` (inside platform action bar / username zone)`
        : ` (inside critical text keep-out)`)
    );
  }
  if (x < zone.x_min) {
    violations.push(
      `LEFT VIOLATION: "${name}" left edge is at x=${x}px — must be >= ${zone.x_min}px`
    );
  }
  if (right > zone.x_max) {
    violations.push(
      `RIGHT VIOLATION: "${name}" right edge is at x=${right}px (left=${x} + width=${width}) — must be <= ${zone.x_max}px` +
      (right > FRAME.WIDTH - KEEP_OUT.RIGHT
        ? ` (inside TikTok/Reels/Shorts action button column)`
        : ` (inside critical text keep-out)`)
    );
  }

  if (violations.length > 0) throw new SafeZoneViolation(name, violations);

  return { valid: true, element: name, x, y, width, height, zone: options.critical ? 'critical' : 'safe' };
}

interface SubtitleParams {
  marginV: number;
  marginR: number;
  marginL: number;
}

interface SubtitleResult {
  valid: true;
  marginV: number;
  marginR: number;
  marginL: number;
}

/**
 * Validate FFmpeg subtitle/caption margin parameters before passing to FFmpeg.
 * Throws SafeZoneViolation if margins would place captions in a keep-out zone.
 */
export function validateSubtitleParams({ marginV, marginR, marginL }: SubtitleParams): SubtitleResult {
  const violations: string[] = [];

  if (marginV < KEEP_OUT.BOTTOM) {
    violations.push(
      `SUBTITLE BOTTOM VIOLATION: MarginV=${marginV}px — captions are ${KEEP_OUT.BOTTOM - marginV}px inside the platform action bar zone. Set MarginV >= ${KEEP_OUT.BOTTOM}.`
    );
  }
  if (marginR < KEEP_OUT.RIGHT) {
    violations.push(
      `SUBTITLE RIGHT VIOLATION: MarginR=${marginR}px — captions extend into the platform action button column. Set MarginR >= ${KEEP_OUT.RIGHT}.`
    );
  }
  if (marginL < KEEP_OUT.LEFT) {
    violations.push(
      `SUBTITLE LEFT VIOLATION: MarginL=${marginL}px — set MarginL >= ${KEEP_OUT.LEFT}.`
    );
  }

  if (violations.length > 0) throw new SafeZoneViolation('subtitles', violations);

  return { valid: true, marginV, marginR, marginL };
}

/** Safe default subtitle params — use these when you don't need custom values. */
export const SAFE_SUBTITLE_DEFAULTS: SubtitleParams = {
  marginV: 320, // 20px buffer beyond the 300px bottom keep-out
  marginR: 160, // 10px buffer beyond the 150px right keep-out
  marginL: 60,  // 10px buffer beyond the 50px left keep-out
};
