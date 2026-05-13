/**
 * safe-zones.test.js — Live test of safe zone enforcement
 *
 * Run with: node --input-type=module < safe-zones.test.js
 * Or:       node safe-zones.test.js (if package.json has "type": "module")
 *
 * This script intentionally places elements in violation zones to prove
 * the validator catches them, then tests valid positions to prove passing works.
 */

import { validateElement, validateSubtitleParams, validateComposition, SAFE_ZONE } from './safe-zones.js';

const print = (...args) => process.stdout.write(args.join(' ') + '\n');

let passed = 0;
let failed = 0;

function test(label, fn, shouldThrow = false) {
  print(`\n[TEST] ${label}`);
  try {
    const result = fn();
    if (shouldThrow) {
      print(`  ❌ SHOULD HAVE THROWN — element was NOT caught as a violation`);
      failed++;
    } else {
      print(`  ✅ PASS — element is valid: ${JSON.stringify(result)}`);
      passed++;
    }
  } catch (err) {
    if (shouldThrow) {
      print(err.message);
      print(`  ✅ CORRECTLY BLOCKED — violation caught before render`);
      passed++;
    } else {
      print(`  ❌ UNEXPECTED ERROR: ${err.message}`);
      failed++;
    }
  }
}

print('\n════════════════════════════════════════════════════════════');
print('  SAFE ZONE ENFORCEMENT TEST — Baldr / Video Editor');
print('  Frame: 1080x1920 (9:16 vertical)');
print(`  Safe zone: x ${SAFE_ZONE.x_min}–${SAFE_ZONE.x_max}, y ${SAFE_ZONE.y_min}–${SAFE_ZONE.y_max}`);
print('════════════════════════════════════════════════════════════');

// ─── VIOLATIONS (should all throw) ───────────────────────────────────────────

print('\n── VIOLATION TESTS (these should all be blocked) ──────────');

test(
  'Terminal overlay at y=60 (inside Dynamic Island zone)',
  () => validateElement('terminal-overlay', 40, 60, 660, 300),
  true // expect throw
);

test(
  'Lower third at y=1700 (inside Instagram username/action bar zone)',
  () => validateElement('lower-third', 50, 1700, 600, 80),
  true
);

test(
  'Like counter badge at x=980 (inside TikTok action button column)',
  () => validateElement('like-badge', 980, 800, 80, 80),
  true
);

test(
  'Full-bleed headline at x=10 (left edge violation)',
  () => validateElement('headline', 10, 200, 1060, 100),
  true
);

test(
  'Caption text at y=0 top AND x=1000 right (multiple violations at once)',
  () => validateElement('caption', 1000, 0, 200, 50),
  true
);

test(
  'Subtitle params: MarginV=20 (captions will land inside action bar)',
  () => validateSubtitleParams({ marginV: 20, marginR: 150, marginL: 50 }),
  true
);

test(
  'Subtitle params: MarginR=30 (captions will overlap action button column)',
  () => validateSubtitleParams({ marginV: 320, marginR: 30, marginL: 50 }),
  true
);

test(
  'Critical text zone: element at y=150 (below regular safe zone but inside critical zone)',
  () => validateElement('important-cta', 80, 150, 400, 80, { critical: true }),
  true
);

// ─── VALID POSITIONS (should all pass) ───────────────────────────────────────

print('\n── VALID POSITION TESTS (these should all pass) ────────────');

test(
  'Terminal overlay at y=150 (safely above Dynamic Island)',
  () => validateElement('terminal-overlay', 50, 150, 660, 300)
);

test(
  'Lower third at y=1400 (safely above action bar)',
  () => validateElement('lower-third', 80, 1400, 600, 80)
);

test(
  'Headline centered at x=100 (safe left), width=780 → right edge=880 (safe)',
  () => validateElement('headline', 100, 250, 780, 100)
);

test(
  'Caption with correct subtitle params: MarginV=320, MarginR=150, MarginL=50',
  () => validateSubtitleParams({ marginV: 320, marginR: 150, marginL: 50 })
);

test(
  'Critical text CTA inside critical text zone',
  () => validateElement('cta-text', 100, 250, 700, 80, { critical: true })
);

// ─── COMPOSITION PRE-FLIGHT (collect all violations at once) ─────────────────

print('\n── COMPOSITION PRE-FLIGHT (full layout check) ───────────────');

const layout = [
  { name: 'background',        x: 0,   y: 0,    width: 1080, height: 1920 }, // full bleed background — VIOLATION
  { name: 'terminal-overlay',  x: 50,  y: 150,  width: 660,  height: 300  }, // safe
  { name: 'lower-third',       x: 80,  y: 1680, width: 600,  height: 80   }, // VIOLATION - too low
  { name: 'headline',          x: 100, y: 250,  width: 780,  height: 100  }, // safe
  { name: 'watermark',         x: 960, y: 200,  width: 100,  height: 40   }, // VIOLATION - too far right
];

const { passed: layoutPassed, failed: layoutFailed } = validateComposition(layout);

print(`\nPre-flight results: ${layoutPassed.length} passed, ${layoutFailed.length} violations`);

if (layoutFailed.length > 0) {
  print('\nVIOLATIONS FOUND — render would be blocked:');
  layoutFailed.forEach(({ element, violations }) => {
    print(`\n  Element: "${element}"`);
    violations.forEach(v => print(`    → ${v}`));
  });
}

if (layoutPassed.length > 0) {
  print('\nElements that passed:');
  layoutPassed.forEach(({ element, x, y, width, height }) => {
    print(`  ✅ "${element}" at (${x}, ${y}) ${width}x${height}`);
  });
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

print('\n════════════════════════════════════════════════════════════');
print(`  RESULTS: ${passed} passed, ${failed} failed`);
print('════════════════════════════════════════════════════════════\n');
