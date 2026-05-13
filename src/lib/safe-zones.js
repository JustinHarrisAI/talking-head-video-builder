/**
 * safe-zones.js — Platform Safe Zone Enforcement for 9:16 Video (1080x1920)
 *
 * This module throws hard errors when any video element is placed in a
 * platform UI keep-out zone. It is not advisory — violations crash the build.
 *
 * Why this exists: On 2026-04-11, a terminal overlay landed in the iPhone
 * Dynamic Island zone at the top, and content competed with Instagram's
 * username/caption bar at the bottom. The problem only appeared after posting.
 * This module catches violations before render.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const FRAME = {
  WIDTH: 1080,
  HEIGHT: 1920,
};

/**
 * Keep-out zones: any element that touches these regions violates a platform boundary.
 * Values in pixels at 1080x1920.
 */
export const KEEP_OUT = {
  TOP: 130,        // Dynamic Island + status bar + platform profile headers
  BOTTOM: 300,     // Username / caption / audio bar / action buttons
  LEFT: 50,        // Edge buffer
  RIGHT: 150,      // Action button column (like, comment, share, follow)
};

/**
 * Derived safe zone boundaries (pixel coordinates, not margins).
 */
export const SAFE_ZONE = {
  x_min: KEEP_OUT.LEFT,                          // 50
  x_max: FRAME.WIDTH - KEEP_OUT.RIGHT,           // 930
  y_min: KEEP_OUT.TOP,                           // 130
  y_max: FRAME.HEIGHT - KEEP_OUT.BOTTOM,         // 1620
};

/**
 * Critical text zone: additional inset for anything that must be clearly readable.
 * Titles, lower thirds, CTAs, important graphics.
 */
export const CRITICAL_TEXT_ZONE = {
  x_min: 80,
  x_max: 900,
  y_min: 200,
  y_max: 1520,
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATOR FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single element's bounding box against the safe zone.
 *
 * @param {string} name     - Human-readable element name (for error messages)
 * @param {number} x        - Left edge of element in pixels
 * @param {number} y        - Top edge of element in pixels
 * @param {number} width    - Element width in pixels
 * @param {number} height   - Element height in pixels
 * @param {object} options  - { critical: true } to apply the tighter critical text zone
 * @throws {SafeZoneViolation} if any edge of the element is in a keep-out zone
 */
export function validateElement(name, x, y, width, height, options = {}) {
  const zone = options.critical ? CRITICAL_TEXT_ZONE : SAFE_ZONE;
  const violations = [];

  const right = x + width;
  const bottom = y + height;

  if (y < zone.y_min) {
    violations.push(
      `TOP VIOLATION: "${name}" top edge is at y=${y}px — must be >= ${zone.y_min}px` +
      (y < KEEP_OUT.TOP ? ` (inside Dynamic Island / platform header zone)` : ` (inside critical text keep-out)`)
    );
  }

  if (bottom > zone.y_max) {
    violations.push(
      `BOTTOM VIOLATION: "${name}" bottom edge is at y=${bottom}px (top=${y} + height=${height}) — must be <= ${zone.y_max}px` +
      (bottom > FRAME.HEIGHT - KEEP_OUT.BOTTOM ? ` (inside platform action bar / username zone)` : ` (inside critical text keep-out)`)
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
      (right > FRAME.WIDTH - KEEP_OUT.RIGHT ? ` (inside TikTok/Reels/Shorts action button column)` : ` (inside critical text keep-out)`)
    );
  }

  if (violations.length > 0) {
    throw new SafeZoneViolation(name, violations);
  }

  return { valid: true, element: name, x, y, width, height, zone: options.critical ? 'critical' : 'safe' };
}

/**
 * Validate FFmpeg subtitle/caption parameters before passing to FFmpeg.
 *
 * @param {object} params - { marginV, marginR, marginL, alignment }
 * @throws {SafeZoneViolation} if margins would place captions in a keep-out zone
 */
export function validateSubtitleParams({ marginV = 0, marginR = 0, marginL = 0, alignment = 2 } = {}) {
  const violations = [];

  // MarginV = distance from bottom edge (when alignment is bottom-aligned)
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

  if (violations.length > 0) {
    throw new SafeZoneViolation('subtitles', violations);
  }

  return { valid: true, marginV, marginR, marginL };
}

/**
 * Validate a full list of elements at once.
 * Returns a summary report — does NOT throw; collects all violations.
 * Use this for pre-flight checks before starting a render job.
 *
 * @param {Array<{name, x, y, width, height, critical?}>} elements
 * @returns {{ passed: [], failed: [] }}
 */
export function validateComposition(elements) {
  const passed = [];
  const failed = [];

  for (const el of elements) {
    try {
      const result = validateElement(el.name, el.x, el.y, el.width, el.height, { critical: el.critical });
      passed.push(result);
    } catch (err) {
      failed.push({ element: el.name, violations: err.violations });
    }
  }

  return { passed, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class SafeZoneViolation extends Error {
  constructor(elementName, violations) {
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
// CONVENIENCE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default {
  FRAME,
  KEEP_OUT,
  SAFE_ZONE,
  CRITICAL_TEXT_ZONE,
  validateElement,
  validateSubtitleParams,
  validateComposition,
  SafeZoneViolation,
};
