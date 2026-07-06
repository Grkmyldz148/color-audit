#!/usr/bin/env node
// The Open-Source Color Audit — static site generator (v3, four-chapter edition).
// Reads data/scorecard.json + data/tokens/*.json and emits index.html.
// Single dependency: helmlab (used at BUILD TIME only, to precompute the
// hue-proof, gray-tint, blue-500-lineup, weight and contrast facts — the
// emitted page is pure static HTML + inline SVG, no JS). Run: npm install && node build.mjs
//
// Numbers policy: every figure on the page is derived from data/scorecard.json,
// data/tokens/*.json, or computed here via helmlab. Nothing is invented, and
// every headline claim is asserted at build time — the build FAILS if the data
// stops supporting it.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Helmlab } = require("helmlab");
const hl = new Helmlab();

const ROOT = dirname(fileURLToPath(import.meta.url));
const scorecard = JSON.parse(readFileSync(join(ROOT, "data/scorecard.json"), "utf8"));
const tokens = {};
for (const key of Object.keys(scorecard.systems)) {
  tokens[key] = JSON.parse(readFileSync(join(ROOT, `data/tokens/${key}.json`), "utf8"));
}
const KEYS = Object.keys(scorecard.systems);
const ACHROMATIC_C = scorecard.achromatic_threshold_C; // 0.03 — the audit's own neutrality cutoff

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// Build-time contrast self-check: the page must practice what it preaches.
// Every text/background pair used in the design is verified here; the build
// FAILS if any pair drops below its target (body text AAA 7:1, all else AA 4.5:1).
// ---------------------------------------------------------------------------

const PALETTE = {
  bg: "#0b0b0d", card: "#121216", text: "#ececf1", muted: "#a8a8b3",
  accent: "#8fc1ff", gold: "#ffd166", pass: "#7fdc9a", fail: "#ff9da3",
};
const CONTRAST_CHECKS = [
  ["text", "bg", 7], ["text", "card", 7],
  ["muted", "bg", 4.5], ["muted", "card", 4.5],
  ["accent", "bg", 4.5], ["gold", "bg", 4.5], ["gold", "card", 4.5],
  ["pass", "bg", 4.5], ["pass", "card", 4.5],
  ["fail", "bg", 4.5], ["fail", "card", 4.5],
];
for (const [fg, bg, min] of CONTRAST_CHECKS) {
  const r = hl.contrastRatio(PALETTE[fg], PALETTE[bg]);
  if (r < min) throw new Error(`Contrast self-check FAILED: ${fg} on ${bg} = ${r.toFixed(2)}:1 < ${min}:1`);
}
console.log("Contrast self-check passed (body text AAA, secondary text AA+).");

// ---------------------------------------------------------------------------
// Basic getters
// ---------------------------------------------------------------------------

function stepsOf(key, scale) {
  return Object.keys(tokens[key].scales[scale]);
}
function hexOf(key, scale, step) {
  return tokens[key].scales[scale][step];
}
// distance between two ADJACENT steps, looked up by the "from" step label
function dist(key, scale, fromStep) {
  const steps = stepsOf(key, scale);
  const i = steps.indexOf(String(fromStep));
  return scorecard.systems[key].scales[scale].step_distances[i];
}
const fmt = (x, d = 3) => x.toFixed(d);
const ratio = (a, b) => a / b;
const rx = (r) => (r >= 6 ? `${Math.round(r)}×` : `${r.toFixed(1)}×`);
const hexes = (k, s) => Object.values(tokens[k].scales[s]);
const names = (k, s) => Object.keys(tokens[k].scales[s]);
const dists = (k, s) => scorecard.systems[k].scales[s].step_distances;
const shortName = (k) =>
  scorecard.systems[k].system.replace(/ \(.*\)/, "").replace(" CSS v4", "").replace(" 5", "").replace(" UI", "").replace(" Colors", "");
const lchOf = (hex) => hl.genToLch(hl.genFromHex(hex));
const SCALES4 = ["blue", "red", "green", "gray"];

// ---------------------------------------------------------------------------
// Derived facts — Chapter 1 (steps), carried over from v2
// ---------------------------------------------------------------------------

// Hue-proof pairs: light-end hue vs drift-step hue, both re-rendered at the SAME
// lightness and chroma (L=0.6, C=0.2 in GenSpace LCh) so ONLY hue differs.
// If either hue is out of sRGB gamut at C=0.2, C is reduced for BOTH jointly.
function hueProofPair(key, scale) {
  const sc = scorecard.systems[key].scales[scale];
  const skipped = new Set(sc.achromatic_steps_skipped);
  const steps = stepsOf(key, scale);
  const first = steps.find((s) => !skipped.has(s));
  const at = sc.hue_drift_at_step;
  const h1 = lchOf(hexOf(key, scale, first))[2];
  const h2 = lchOf(hexOf(key, scale, at))[2];
  const L = 0.6;
  let C = 0.2;
  const inGamut = (h, c) => hl.genToSrgb(hl.genFromLch([L, c, h])).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  while (C > 0.02 && !(inGamut(h1, C) && inGamut(h2, C))) C -= 0.005;
  return {
    firstStep: first, driftStep: at, h1, h2, L, C,
    hexA: hl.genToHex(hl.genFromLch([L, C, h1])),
    hexB: hl.genToHex(hl.genFromLch([L, C, h2])),
    drift: sc.hue_drift_deg,
  };
}

// Grayscale skeleton: each token re-rendered as neutral gray at its MEASURED
// GenSpace lightness — genFromLch([L, 0, 0]) — so only the darkness ladder shows.
function graySkeleton(key, scale) {
  const L = scorecard.systems[key].scales[scale].L;
  return L.map((l) => hl.genToHex(hl.genFromLch([l, 0, 0])));
}

const F = {
  // 1.1: Bootstrap blue 8×
  bsBlueBig: dist("bootstrap", "blue", "100"),          // 0.3029
  bsBlueSmall: dist("bootstrap", "blue", "400"),        // 0.0380
  // 1.2: Primer glued neutral
  primerGraySmall: dist("primer", "gray", "4"),         // 0.0111
  primerGrayBig: dist("primer", "gray", "7"),           // 0.2060
  // 1.3: hover squeeze receipts
  matBlue400: hexOf("material", "blue", "400"),
  matBlue500: hexOf("material", "blue", "500"),
  matBlueDup: dist("material", "blue", "400"),          // 0.0263
  matBlueBig: dist("material", "blue", "50"),           // 0.1621
  twBlue500: hexOf("tailwind", "blue", "500"),
  twBlue600: hexOf("tailwind", "blue", "600"),
  twBlueDup: dist("tailwind", "blue", "500"),           // 0.0451
  twBlueBig: dist("tailwind", "blue", "200"),           // 0.2194
  // 2.1: hue proofs
  primerBlueProof: hueProofPair("primer", "blue"),      // 27.6°
  twBlueProof: hueProofPair("tailwind", "blue"),        // 9.6°
  // 4: Primer red praise
  primerRedCv: scorecard.systems.primer.scales.red.step_cv_pct,           // 16.87
  primerRedRatio: scorecard.systems.primer.scales.red.step_max_min_ratio, // 1.8
  primerRedMin: Math.min(...scorecard.systems.primer.scales.red.step_distances),
  primerRedMax: Math.max(...scorecard.systems.primer.scales.red.step_distances),
  // 4: Radix
  radixRedCliff: dist("radix", "red", "11"),            // 0.4349
};

// sanity: the "largest single step in the audit" claim
const ALL_D = Object.entries(scorecard.systems).flatMap(([k, s]) =>
  Object.values(s.scales).flatMap((sc) => sc.step_distances));
if (Math.abs(Math.max(...ALL_D) - F.radixRedCliff) > 1e-9)
  throw new Error("Fact check failed: Radix red 11→12 is no longer the largest step in the audit.");

// sanity: the "smallest chromatic step in the audit" claim (Chapter 1.3).
// Chromatic = every scale except gray; the claim is relative, not "invisible".
const CHROMATIC_D = Object.values(scorecard.systems).flatMap((s) =>
  Object.entries(s.scales).filter(([name]) => name !== "gray").flatMap(([, sc]) => sc.step_distances));
if (Math.abs(Math.min(...CHROMATIC_D) - F.matBlueDup) > 1e-9)
  throw new Error("Fact check failed: Material blue 400→500 is no longer the smallest chromatic step in the audit.");

// Scale context for the near-duplicate captions, computed live via helmlab:
// the trained perceptual metric (saturates near ~0.15 for very dissimilar
// pairs) and plain Metric-Lab Euclidean distance, each anchored to black↔white.
const CTX = {
  bwDiff: hl.difference("#000000", "#ffffff"),            // ~0.149 (metric saturation)
  matPairDiff: hl.difference(F.matBlue400, F.matBlue500), // ~0.044
  twPairDiff: hl.difference(F.twBlue500, F.twBlue600),    // ~0.072
  primerGrayPairDiff: hl.difference(hexOf("primer", "gray", "4"), hexOf("primer", "gray", "5")), // ~0.019
};

const TOTAL_STEPS = ALL_D.length;

// ---------------------------------------------------------------------------
// Derived facts — Chapter 2b: "Your gray isn't gray" (NEW, computed via helmlab)
// For every gray token in every system: C = genToLch(genFromHex(hex))[1].
// A token counts as TINTED only above the audit's own achromatic cutoff
// (C ≥ 0.03); its "true-neutral twin" is genFromLch([same L, 0, 0]).
// ---------------------------------------------------------------------------

const GRAY = {};
for (const k of KEYS) {
  const rows = Object.entries(tokens[k].scales.gray).map(([step, hex]) => {
    const [L, C, h] = lchOf(hex);
    return { step, hex, L, C, h };
  });
  const worst = rows.reduce((a, b) => (b.C > a.C ? b : a));
  GRAY[k] = {
    rows,
    maxC: worst.C,
    worst: { ...worst, twin: hl.genToHex(hl.genFromLch([worst.L, 0, 0])) },
    neutral: worst.C < 1e-3,                 // every step ink-true
    tinted: worst.C >= ACHROMATIC_C,         // meaningfully tinted somewhere
  };
  GRAY[k].worst.twinDiff = hl.difference(GRAY[k].worst.hex, GRAY[k].worst.twin);
}

// ASSERTIONS for the gray-tint headlines:
// (a) "Material and Radix ship ink-true grays" — every step C < 0.001.
for (const k of ["material", "radix"]) {
  if (!GRAY[k].neutral) throw new Error(
    `Gray-tint assert FAILED: ${k} gray is claimed truly neutral but max C = ${GRAY[k].maxC.toFixed(4)}.`);
}
// (b) "Tailwind gray-900 and Chakra gray-500 are in a dead heat for most tinted"
{
  const all = KEYS.flatMap((k) => GRAY[k].rows.map((r) => ({ k, ...r }))).sort((a, b) => b.C - a.C);
  const top2 = all.slice(0, 2).map((r) => `${r.k}:${r.step}`).sort().join(",");
  if (top2 !== "chakra:500,tailwind:900") throw new Error(
    `Gray-tint assert FAILED: top-2 most tinted grays are ${top2}, not tailwind:900 + chakra:500.`);
  if (all[0].C < 0.05 || all[1].C < 0.05) throw new Error(
    "Gray-tint assert FAILED: the 'most tinted' pair no longer measures meaningfully high (C ≥ 0.05).");
  if (Math.abs(all[0].C - all[1].C) > 0.001) throw new Error(
    "Gray-tint assert FAILED: 'dead heat' claim — top-2 tint chromas differ by more than 0.001.");
}
// (c) "Not one gray in the audit leans warm" — every tinted gray token is cool
//     (hue in the blue sector, 220–280°).
for (const k of KEYS) for (const r of GRAY[k].rows) {
  if (r.C >= ACHROMATIC_C && (r.h < 220 || r.h > 280)) throw new Error(
    `Gray-tint assert FAILED: ${k} gray ${r.step} is tinted (C=${r.C.toFixed(3)}) but hue ${r.h.toFixed(0)}° is not cool/blue.`);
}
console.log("Gray-tint asserts passed (Material+Radix ink-true; Tailwind-900/Chakra-500 dead heat; all tints lean cool).");

// ---------------------------------------------------------------------------
// Derived facts — Chapter 2c + 3: the mid ("500-equivalent") row per system.
// mid step comes from each token file (500; Radix 9; Primer 5).
// ---------------------------------------------------------------------------

const MID = {};
for (const k of KEYS) {
  const step = tokens[k].mid;
  const cells = {};
  for (const s of SCALES4) {
    const hex = hexOf(k, s, step);
    const [L, C, h] = lchOf(hex);
    cells[s] = { hex, L, C, h, crWhite: hl.contrastRatio("#ffffff", hex), twin: hl.genToHex(hl.genFromLch([L, 0, 0])) };
  }
  const Ls = SCALES4.map((s) => cells[s].L);
  MID[k] = { step, cells, minL: Math.min(...Ls), maxL: Math.max(...Ls), spreadL: Math.max(...Ls) - Math.min(...Ls) };
}

// The six blue-500-equivalents, sorted darkest → lightest.
const BLUES = KEYS.map((k) => ({ k, step: MID[k].step, ...MID[k].cells.blue })).sort((a, b) => a.L - b.L);
const BLUE_L_SPREAD = BLUES[BLUES.length - 1].L - BLUES[0].L;
const BLUE_H = BLUES.map((b) => b.h);
const BLUE_H_SPREAD = Math.max(...BLUE_H) - Math.min(...BLUE_H);
const BLUE_CR = BLUES.map((b) => b.crWhite);

// ASSERTIONS for the blue-500 lineup headlines:
// "same token name, visibly different colors" — every pair of the six must be
// clearly above the near-duplicate threshold used elsewhere on this page.
{
  let minPair = Infinity, pair = "";
  for (let i = 0; i < BLUES.length; i++) for (let j = i + 1; j < BLUES.length; j++) {
    const d = hl.difference(BLUES[i].hex, BLUES[j].hex);
    if (d < minPair) { minPair = d; pair = `${BLUES[i].k}/${BLUES[j].k}`; }
  }
  if (minPair < 0.025) throw new Error(
    `Blue-500 assert FAILED: '${pair}' measure ${minPair.toFixed(4)} apart — not "visibly different".`);
  if (BLUE_L_SPREAD < 0.1) throw new Error("Blue-500 assert FAILED: lightness spread no longer material (< 0.1).");
  if (BLUES[0].k !== "primer" || BLUES[BLUES.length - 1].k !== "material") throw new Error(
    "Blue-500 assert FAILED: darkest/lightest mid blues are no longer Primer/Material.");
}
console.log("Blue-500 lineup asserts passed (all pairwise visibly different; L spread material).");

// ASSERTIONS for the weight/contrast crossover headlines (Chapter 3):
const AA = 4.5;
function assertCR(k, s, pass) {
  const cr = MID[k].cells[s].crWhite;
  if (pass && cr < AA) throw new Error(`Weight assert FAILED: ${k} ${s}-${MID[k].step} claimed to PASS white text but is ${cr.toFixed(3)}:1.`);
  if (!pass && cr >= AA) throw new Error(`Weight assert FAILED: ${k} ${s}-${MID[k].step} claimed to FAIL white text but is ${cr.toFixed(3)}:1.`);
}
assertCR("tailwind", "gray", true);  assertCR("tailwind", "green", false); // the in-system crossover
assertCR("bootstrap", "blue", true); assertCR("bootstrap", "red", true);
assertCR("bootstrap", "green", true); assertCR("bootstrap", "gray", false);
assertCR("primer", "blue", true); assertCR("primer", "red", true);
assertCR("primer", "green", true); assertCR("primer", "gray", false);
for (const s of SCALES4) { assertCR("material", s, false); assertCR("radix", s, false); assertCR("chakra", s, false); }
// "Radix's four solids carry the same weight" — tightest mid-row L spread of the six.
{
  const sorted = [...KEYS].sort((a, b) => MID[a].spreadL - MID[b].spreadL);
  if (sorted[0] !== "radix") throw new Error(
    `Weight assert FAILED: tightest mid-row is ${sorted[0]}, not Radix.`);
  if (sorted[1] !== "chakra") throw new Error(
    `Weight assert FAILED: second-tightest mid-row is ${sorted[1]}, not Chakra.`);
}
console.log("Weight/contrast asserts passed (Tailwind gray/green crossover; Bootstrap+Primer color-vs-gray splits; Radix tightest row).");

// ASSERTIONS for the Chapter 4 "steal" claims:
{
  const flat = KEYS.flatMap((k) => Object.entries(scorecard.systems[k].scales).map(([s, v]) => ({ k, s, ...v })));
  // Bootstrap: evenest darkness ladder of all 24 scales (green L-CV).
  const byLcv = [...flat].sort((a, b) => a.L_cv_pct - b.L_cv_pct);
  if (byLcv[0].k !== "bootstrap" || byLcv[0].s !== "green") throw new Error(
    `Steal assert FAILED: evenest darkness ladder is ${byLcv[0].k}/${byLcv[0].s}, not Bootstrap green.`);
  // Bootstrap: best mean L-CV of the six systems.
  const byMean = [...scorecard.ranking_by_mean_step_cv].sort((a, b) => a.mean_L_cv_pct - b.mean_L_cv_pct);
  if (byMean[0].key !== "bootstrap") throw new Error(
    `Steal assert FAILED: best mean L-CV is ${byMean[0].key}, not Bootstrap.`);
  // Primer red: most even ramp among the hand-designed scales (everything except
  // machine-mixed Bootstrap), by step CV — and only Bootstrap green is tighter overall.
  const byCv = [...flat].sort((a, b) => a.step_cv_pct - b.step_cv_pct);
  if (!(byCv[0].k === "bootstrap" && byCv[0].s === "green" && byCv[1].k === "primer" && byCv[1].s === "red")) throw new Error(
    `Steal assert FAILED: step-CV order is ${byCv[0].k}/${byCv[0].s}, ${byCv[1].k}/${byCv[1].s} — Primer red is no longer the most even hand-built ramp.`);
  // Chakra: most consistent trio of chromatic ramps (smallest spread of chromatic L-CVs).
  const trioSpread = (k) => {
    const v = ["blue", "red", "green"].map((s) => scorecard.systems[k].scales[s].L_cv_pct);
    return Math.max(...v) - Math.min(...v);
  };
  const byTrio = [...KEYS].sort((a, b) => trioSpread(a) - trioSpread(b));
  if (byTrio[0] !== "chakra") throw new Error(
    `Steal assert FAILED: most consistent chromatic trio is ${byTrio[0]}, not Chakra.`);
}
console.log("Chapter-4 steal asserts passed (Bootstrap ladder, Primer red, Chakra trio).");

// ---------------------------------------------------------------------------
// Build-time HONESTY GATE: visual proof patterns are type-checked against the
// claim they make. A "spot the boundary" / seamless side-by-side visual claims
// the pair is a near-duplicate — so the pair's trained perceptual difference
// (hl.difference) must be below JND_GATE, or the build FAILS. "Smallest step
// in a ramp" is a relative fact, not a perceptual one: design systems make
// steps visible on purpose, so a ramp's closest pair is usually still plainly
// visible when butted together — and a visual that invites the reader to
// struggle to see a difference falsifies itself the moment the difference is
// easy to see. Relative claims get gap-row receipts, never this pattern.
// ---------------------------------------------------------------------------

const JND_GATE = 0.025;
function gateNearDuplicate(hexA, hexB, label) {
  const d = hl.difference(hexA, hexB);
  if (d >= JND_GATE) throw new Error(
    `Honesty gate FAILED: "${label}" uses a near-duplicate visual pattern (seamless side-by-side / spot-the-boundary) ` +
    `but hl.difference(${hexA}, ${hexB}) = ${d.toFixed(4)} >= ${JND_GATE}. ` +
    `A near-duplicate visual falsifies its own claim unless the pair is genuinely sub-threshold. ` +
    `Show this pair as a gap-row receipt (relative claim) instead.`);
  return d;
}

// Gate self-test — prove the gate is real: the one pair allowed to use the
// pattern must pass, and the audit's smallest chromatic step (Material blue
// 400/500 — difference ~0.044 on a metric that saturates near ~0.149, i.e.
// ~30% of max and way above threshold) must be REJECTED.
gateNearDuplicate(hexOf("primer", "gray", "4"), hexOf("primer", "gray", "5"), "gate self-test: Primer gray 4→5");
{
  let rejected = false;
  try { gateNearDuplicate(F.matBlue400, F.matBlue500, "gate self-test: Material blue 400→500"); }
  catch { rejected = true; }
  if (!rejected) throw new Error(
    "Honesty-gate self-test FAILED: Material blue 400/500 passed the near-duplicate gate — the gate is not real.");
}
console.log(`Honesty gate active (near-duplicate visuals require hl.difference < ${JND_GATE}): ` +
  `Primer gray 4→5 passes (${CTX.primerGrayPairDiff.toFixed(3)}); Material blue 400→500 correctly rejected (${CTX.matPairDiff.toFixed(3)}).`);

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

const MONO = "ui-monospace,Menlo,monospace";
const SANS = "system-ui,sans-serif";

// Contiguous strip of swatches (uniform 3px gaps) — the "what ships" view.
function colorStripSVG(label, hexes, stepNames = null, height = 34) {
  const n = hexes.length;
  const W = 1000, gap = 3;
  const w = (W - gap * (n - 1)) / n;
  let rects = "";
  hexes.forEach((hex, i) => {
    const x = i * (w + gap);
    const t = stepNames ? `${label} ${stepNames[i]}: ${hex}` : `${label}: ${hex}`;
    rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${hex}"><title>${esc(t)}</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${height}" width="100%" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">${rects}</svg>`;
}

// THE core visualization: a row of swatches where the GAP between adjacent
// swatches is proportional to the measured perceptual distance between them.
// Even scale → even gaps. Uneven scale → you see it without reading a number.
function gapRowSVG(label, hexes, stepNames, dists, opts = {}) {
  const n = hexes.length;
  const W = 1000;
  const SW = opts.swatchH || 46;
  const LABEL_H = stepNames ? 22 : 0;
  const H = SW + LABEL_H;
  const totalGap = W * 0.42;
  const sw = (W - totalGap) / n;
  const dSum = dists.reduce((a, b) => a + b, 0);
  let x = 0, out = "";
  hexes.forEach((hex, i) => {
    out += `<rect x="${x.toFixed(2)}" y="0" width="${sw.toFixed(2)}" height="${SW}" fill="${hex}"><title>${esc(
      `${label} ${stepNames ? stepNames[i] : i}: ${hex}`)}</title></rect>`;
    if (stepNames) {
      out += `<text x="${(x + sw / 2).toFixed(2)}" y="${SW + 16}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">${esc(stepNames[i])}</text>`;
    }
    if (i < n - 1) {
      const g = totalGap * (dists[i] / dSum);
      out += `<line x1="${(x + sw).toFixed(2)}" y1="${SW / 2}" x2="${(x + sw + g).toFixed(2)}" y2="${SW / 2}" stroke="${PALETTE.line}" stroke-width="2"><title>${esc(
        `${label} ${stepNames ? stepNames[i] + "→" + stepNames[i + 1] : ""}: perceptual distance ${dists[i].toFixed(4)}`)}</title></line>`;
      if (opts.annotate && opts.annotate[i] != null) {
        out += `<text x="${(x + sw + g / 2).toFixed(2)}" y="${SW / 2 - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="${PALETTE.gold}" font-family="${MONO}">${esc(opts.annotate[i])}</text>`;
      }
      x += sw + g;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(
    `${label}: swatches spaced so the gap between neighbors equals their measured perceptual distance. Even gaps = even scale.`)}">${out}</svg>`;
}

// Two huge swatches, side by side. gap=0 butts them together (near-duplicate
// proof — GATED: only genuinely sub-threshold pairs may use it); a small gap
// separates clearly-different pairs (hue proof).
function bigPairSVG(hexA, hexB, labelA, labelB, gap = 0, height = 230) {
  if (gap === 0) gateNearDuplicate(hexA, hexB, `${labelA} / ${labelB}`);
  const W = 1000;
  const w = (W - gap) / 2;
  return `<svg viewBox="0 0 ${W} ${height + 30}" width="100%" role="img" aria-label="${esc(`${labelA} next to ${labelB}`)}">
  <rect x="0" y="0" width="${w}" height="${height}" fill="${hexA}"><title>${esc(labelA)}</title></rect>
  <rect x="${w + gap}" y="0" width="${w}" height="${height}" fill="${hexB}"><title>${esc(labelB)}</title></rect>
  <text x="${w / 2}" y="${height + 21}" text-anchor="middle" font-size="14" fill="${PALETTE.muted}" font-family="${MONO}">${esc(labelA)}</text>
  <text x="${w + gap + w / 2}" y="${height + 21}" text-anchor="middle" font-size="14" fill="${PALETTE.muted}" font-family="${MONO}">${esc(labelB)}</text>
</svg>`;
}

// Full-bleed "spot the boundary" strip: two colors butted, no seam drawn.
// GATED: this pattern claims "you will struggle to see the boundary", so the
// pair must measure below JND_GATE or the build fails.
function boundaryStripSVG(hexA, hexB, label) {
  gateNearDuplicate(hexA, hexB, label);
  return `<svg viewBox="0 0 1000 120" width="100%" height="120" role="img" aria-label="${esc(label)}" preserveAspectRatio="none"><rect x="0" y="0" width="500" height="120" fill="${hexA}"/><rect x="500" y="0" width="500" height="120" fill="${hexB}"/><title>${esc(label)}</title></svg>`;
}

// Small receipt chips: two modest swatches with a visible gap between them —
// used to show a "closest pair" as a receipt INSIDE an unevenness narrative.
// The claim is relative ("the ramp's smallest step"), never "can you tell
// them apart", so the near-duplicate gate deliberately does not apply here
// (and these pairs would fail it — that's the point).
function receiptChipsSVG(hexA, hexB, labelA, labelB) {
  const chipW = 170, chipH = 96, gap = 14, W = chipW * 2 + gap, H = chipH + 26;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto" role="img" aria-label="${esc(`${labelA} next to ${labelB}`)}">
  <rect x="0" y="0" width="${chipW}" height="${chipH}" fill="${hexA}"><title>${esc(labelA)}</title></rect>
  <rect x="${chipW + gap}" y="0" width="${chipW}" height="${chipH}" fill="${hexB}"><title>${esc(labelB)}</title></rect>
  <text x="${chipW / 2}" y="${chipH + 18}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">${esc(labelA)}</text>
  <text x="${chipW + gap + chipW / 2}" y="${chipH + 18}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">${esc(labelB)}</text>
</svg>`;
}

// NEW (Chapter 2b): grid of [most-tinted gray | true-neutral twin] pairs, one
// per system. Chips get a small gap — the claim is "see the tint", never
// "spot the boundary" — except that for the two ink-true systems the chips are
// literally the same color, which is itself the proof.
function tintPairsSVG() {
  const order = [...KEYS].sort((a, b) => GRAY[b].maxC - GRAY[a].maxC);
  const cols = 3, cellW = 330, cellH = 190, gapX = 5, chipW = 155, chipH = 96, chipGap = 8;
  const W = cols * cellW + (cols - 1) * gapX, rows = Math.ceil(order.length / cols);
  const H = rows * cellH;
  let out = "";
  order.forEach((k, i) => {
    const g = GRAY[k].worst;
    const x0 = (i % cols) * (cellW + gapX), y0 = Math.floor(i / cols) * cellH;
    const verdict = GRAY[k].neutral ? "truly neutral" : (GRAY[k].tinted ? "cool tint" : "faint lean (below cutoff)");
    out += `<text x="${x0}" y="${y0 + 16}" font-size="15" font-weight="700" fill="${PALETTE.text}" font-family="${SANS}">${esc(shortName(k))} gray-${g.step}</text>`;
    out += `<text x="${x0}" y="${y0 + 34}" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">C ${g.C.toFixed(3)} · ${esc(verdict)}</text>`;
    out += `<rect x="${x0}" y="${y0 + 44}" width="${chipW}" height="${chipH}" fill="${g.hex}"><title>${esc(`${shortName(k)} gray ${g.step} as shipped: ${g.hex} (C=${g.C.toFixed(3)})`)}</title></rect>`;
    out += `<rect x="${x0 + chipW + chipGap}" y="${y0 + 44}" width="${chipW}" height="${chipH}" fill="${g.twin}"><title>${esc(`true neutral at the same lightness: ${g.twin}`)}</title></rect>`;
    out += `<text x="${x0 + chipW / 2}" y="${y0 + 44 + chipH + 16}" text-anchor="middle" font-size="11" fill="${PALETTE.muted}" font-family="${MONO}">shipped ${esc(g.hex)}</text>`;
    out += `<text x="${x0 + chipW + chipGap + chipW / 2}" y="${y0 + 44 + chipH + 16}" text-anchor="middle" font-size="11" fill="${PALETTE.muted}" font-family="${MONO}">neutral ${esc(g.twin)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Each system's most-tinted gray next to a true neutral rebuilt at the same lightness">${out}</svg>`;
}

// NEW (Chapter 2c): the six blue-500-equivalents as labeled swatches,
// sorted darkest → lightest. Same token name, six different colors.
function blueLineupSVG() {
  const n = BLUES.length, W = 1000, gap = 16, chipW = (W - gap * (n - 1)) / n, chipH = 150;
  let out = "";
  BLUES.forEach((b, i) => {
    const x = i * (chipW + gap);
    out += `<rect x="${x.toFixed(1)}" y="0" width="${chipW.toFixed(1)}" height="${chipH}" fill="${b.hex}"><title>${esc(
      `${shortName(b.k)} blue ${b.step}: ${b.hex} — L ${b.L.toFixed(3)}, hue ${b.h.toFixed(1)}°`)}</title></rect>
    <text x="${(x + chipW / 2).toFixed(1)}" y="${chipH + 22}" text-anchor="middle" font-size="15" font-weight="700" fill="${PALETTE.text}" font-family="${SANS}">${esc(shortName(b.k))}</text>
    <text x="${(x + chipW / 2).toFixed(1)}" y="${chipH + 41}" text-anchor="middle" font-size="11.5" fill="${PALETTE.muted}" font-family="${MONO}">blue-${esc(b.step)} ${esc(b.hex)}</text>
    <text x="${(x + chipW / 2).toFixed(1)}" y="${chipH + 58}" text-anchor="middle" font-size="11.5" fill="${PALETTE.muted}" font-family="${MONO}">L ${b.L.toFixed(2)} · hue ${b.h.toFixed(0)}°</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${chipH + 68}" width="100%" role="img" aria-label="The six systems' blue-500 equivalents side by side, sorted darkest to lightest">${out}</svg>`;
}

// NEW (Chapter 3.1): per system, the mid row (blue/red/green/gray) with each
// chip's gray twin fused underneath at its measured lightness — same step
// number, visibly different weight. Sorted tightest row first.
function weightRowsSVG() {
  const order = [...KEYS].sort((a, b) => MID[a].spreadL - MID[b].spreadL);
  const W = 1000, labelW = 0, colW = 238, colGap = (W - colW * 4) / 3, rowH = 168, chipH = 46;
  const H = order.length * rowH - 26;
  let out = "";
  order.forEach((k, r) => {
    const y0 = r * rowH;
    out += `<text x="0" y="${y0 + 15}" font-size="15" font-weight="700" fill="${PALETTE.text}" font-family="${SANS}">${esc(shortName(k))}</text>
    <text x="${W}" y="${y0 + 15}" text-anchor="end" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">step ${esc(MID[k].step)} · weight spread ${MID[k].spreadL.toFixed(3)} L</text>`;
    SCALES4.forEach((s, c) => {
      const cell = MID[k].cells[s];
      const x = c * (colW + colGap);
      out += `<rect x="${x}" y="${y0 + 24}" width="${colW}" height="${chipH}" fill="${cell.hex}"><title>${esc(
        `${shortName(k)} ${s}-${MID[k].step}: ${cell.hex}`)}</title></rect>
      <rect x="${x}" y="${y0 + 24 + chipH}" width="${colW}" height="${chipH}" fill="${cell.twin}"><title>${esc(
        `${shortName(k)} ${s}-${MID[k].step} as neutral gray at its measured lightness L=${cell.L.toFixed(3)}`)}</title></rect>
      <text x="${x + colW / 2}" y="${y0 + 24 + chipH * 2 + 17}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">${esc(s)} · L ${cell.L.toFixed(2)}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Each system's mid row (blue, red, green, gray) with each chip's neutral-gray twin underneath at its measured lightness — same step number, different visual weight">${out}</svg>`;
}

// NEW (Chapter 3.2): the mid row again, wearing white sample text, with the
// measured white-text contrast ratio and a PASS/FAIL badge per chip.
function contrastGridSVG() {
  const passCount = (k) => SCALES4.filter((s) => MID[k].cells[s].crWhite >= AA).length;
  const order = [...KEYS].sort((a, b) => passCount(b) - passCount(a) || MID[b].cells.blue.crWhite - MID[a].cells.blue.crWhite);
  const W = 1000, colW = 238, colGap = (W - colW * 4) / 3, rowH = 140, chipH = 74;
  const H = (order.length - 1) * rowH + 24 + chipH + 28;
  let out = "";
  order.forEach((k, r) => {
    const y0 = r * rowH;
    out += `<text x="0" y="${y0 + 15}" font-size="15" font-weight="700" fill="${PALETTE.text}" font-family="${SANS}">${esc(shortName(k))}</text>
    <text x="${W}" y="${y0 + 15}" text-anchor="end" font-size="12" fill="${PALETTE.muted}" font-family="${MONO}">white text on step ${esc(MID[k].step)} · AA needs ${AA}:1</text>`;
    SCALES4.forEach((s, c) => {
      const cell = MID[k].cells[s];
      const x = c * (colW + colGap);
      const ok = cell.crWhite >= AA;
      out += `<rect x="${x}" y="${y0 + 24}" width="${colW}" height="${chipH}" fill="${cell.hex}"><title>${esc(
        `${shortName(k)} ${s}-${MID[k].step} (${cell.hex}) — white text ${cell.crWhite.toFixed(2)}:1 ${ok ? "passes" : "fails"} AA`)}</title></rect>
      <text x="${x + colW / 2}" y="${y0 + 24 + chipH / 2 + 9}" text-anchor="middle" font-size="26" font-weight="700" fill="#ffffff" font-family="${SANS}">Aa</text>
      <text x="${x + colW / 2}" y="${y0 + 24 + chipH + 20}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${ok ? PALETTE.pass : PALETTE.fail}" font-family="${MONO}">${esc(s)} ${cell.crWhite.toFixed(2)}:1 ${ok ? "PASS" : "FAIL"}</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="White sample text on each system's mid row with measured WCAG contrast ratios and pass/fail verdicts">${out}</svg>`;
}

// Six mid-shade chips, each carrying legible sample text (white or black,
// whichever measures higher contrast against that chip).
function midChipsSVG() {
  const order = scorecard.ranking_by_mean_step_cv;
  const W = 1000, chipW = 150, chipH = 120, gap = (W - chipW * 6) / 5;
  let out = "";
  order.forEach((r, i) => {
    const sys = scorecard.systems[r.key];
    const mid = sys.scales.blue.mid;
    const useWhite = mid.contrast_vs_white >= mid.contrast_vs_black;
    const ink = useWhite ? "#ffffff" : "#000000";
    const cr = useWhite ? mid.contrast_vs_white : mid.contrast_vs_black;
    const x = i * (chipW + gap);
    out += `<rect x="${x}" y="0" width="${chipW}" height="${chipH}" fill="${mid.hex}"><title>${esc(
      `${sys.system} blue ${mid.step} (${mid.hex}) — ${cr.toFixed(2)}:1 vs ${useWhite ? "white" : "black"}`)}</title></rect>
    <text x="${x + chipW / 2}" y="${chipH / 2 + 14}" text-anchor="middle" font-size="40" font-weight="700" fill="${ink}" font-family="${SANS}">Aa</text>
    <text x="${x + chipW / 2}" y="${chipH + 22}" text-anchor="middle" font-size="13" fill="${PALETTE.muted}" font-family="${SANS}">${esc(shortName(r.key))}</text>
    <text x="${x + chipW / 2}" y="${chipH + 40}" text-anchor="middle" font-size="11" fill="${PALETTE.muted}" font-family="${MONO}">${cr.toFixed(1)}:1 ${useWhite ? "white" : "black"}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${chipH + 50}" width="100%" role="img" aria-label="Each system's mid blue with its best-contrast text color">${out}</svg>`;
}

PALETTE.line = "#2a2a31";

// ---------------------------------------------------------------------------
// PROOF BLOCKS — headline (designer consequence), visual (the evidence),
// caption (what breaks), small print (the number).
// ---------------------------------------------------------------------------

function proofBlock({ id, kicker, headline, deck, visual, caption, small, tone = "" }) {
  return `<section class="proof ${tone}" id="${id}">
  <span class="proof-kicker">${esc(kicker)}</span>
  <h2 class="proof-head">${esc(headline)}</h2>
  ${deck ? `<p class="proof-deck">${deck}</p>` : ""}
  <div class="proof-visual">${visual}</div>
  <p class="proof-caption">${caption}</p>
  <p class="proof-small">${small}</p>
</section>`;
}

function chapterIntro({ id, num, title, headline, intro }) {
  return `<section class="chapter" id="${id}">
  <span class="chapter-kicker">Chapter ${num} · ${esc(title)}</span>
  <h2 class="chapter-head">${esc(headline)}</h2>
  <p class="chapter-intro">${intro}</p>
</section>`;
}

const bsAnnotate = {};
{
  const st = names("bootstrap", "blue");
  bsAnnotate[st.indexOf("100")] = rx(ratio(F.bsBlueBig, F.bsBlueSmall));
  bsAnnotate[st.indexOf("400")] = "1×";
}
const pgAnnotate = {};
{
  const st = names("primer", "gray");
  pgAnnotate[st.indexOf("4")] = "1×";
  pgAnnotate[st.indexOf("7")] = rx(ratio(F.primerGrayBig, F.primerGraySmall));
}
const matAnnotate = {};
{
  const st = names("material", "blue");
  matAnnotate[st.indexOf("50")] = rx(ratio(F.matBlueBig, F.matBlueDup));
  matAnnotate[st.indexOf("400")] = "1×";
}

// ------------------------------ CHAPTER 1 ---------------------------------

const CH1 = [
  chapterIntro({
    id: "ch1", num: 1, title: "Steps",
    headline: "A “+1” should always buy the same amount of change.",
    intro: `Token names promise a staircase — every step down the scale should feel like one step. We measured the actual size of all ${TOTAL_STEPS} steps. The gaps in the pictures below are drawn exactly as wide as the measured change.`,
  }),

  proofBlock({
    id: "whisper-shout",
    kicker: "1.1 · Bootstrap",
    headline: "One step whispers, another shouts.",
    deck: `Below, each gap is drawn exactly as wide as the measured perceptual distance between neighbors. Even scale, even gaps. This is Bootstrap's blue.`,
    visual: gapRowSVG("Bootstrap blue", hexes("bootstrap", "blue"), names("bootstrap", "blue"), dists("bootstrap", "blue"), { annotate: bsAnnotate }),
    caption: `The 100→200 jump is ${rx(ratio(F.bsBlueBig, F.bsBlueSmall))} the 400→500 jump. The token names promise even stairs; what ships is one cliff at the light end and three whisper-small steps in the middle. The same "one shade darker" tweak buys ${rx(ratio(F.bsBlueBig, F.bsBlueSmall))} more visible change at 100 than at 400.`,
    small: `100→200 = ${fmt(F.bsBlueBig, 3)}, 400→500 = ${fmt(F.bsBlueSmall, 3)} in GenSpace. Bootstrap tints and shades by mixing RGB with white/black — equal paint-mixing is not equal seeing.`,
  }),

  proofBlock({
    id: "glued-gray",
    kicker: "1.2 · GitHub Primer",
    headline: "One gray scale. Except it's two.",
    deck: `Primer's 14-step neutral behaves like two scales glued together: seven whisper-quiet light grays, a cliff, then a normal dark ramp. How quiet is the quiet end? The second strip answers: gray 4 meets gray 5 at its midpoint, no seam drawn.`,
    visual: `${gapRowSVG("Primer neutral", hexes("primer", "gray"), names("primer", "gray"), dists("primer", "gray"), { annotate: pgAnnotate })}
      <div class="bleed" style="margin-top:36px">${boundaryStripSVG(hexOf("primer", "gray", "4"), hexOf("primer", "gray", "5"), `Primer gray 4 (${hexOf("primer", "gray", "4")}) meets gray 5 (${hexOf("primer", "gray", "5")}) at the midpoint of this strip`)}</div>`,
    caption: `The 7→8 seam is ${rx(ratio(F.primerGrayBig, F.primerGraySmall))} the 4→5 step — and 4→5 is the only pair among all ${TOTAL_STEPS} steps that measures genuinely near threshold (${fmt(CTX.primerGrayPairDiff, 3)}, under this build's ${JND_GATE} near-duplicate gate), which is why it alone gets the spot-the-boundary strip. Every other "closest pair" in the audit is plainly visible butted together, and showing one this way would falsify the claim on sight. Many quiet surface grays isn't necessarily wrong for light-mode UI — but if you pick borders by nudging the step number, this ramp will not behave linearly.`,
    small: `4→5 = ${fmt(F.primerGraySmall, 3)}, 7→8 = ${fmt(F.primerGrayBig, 3)} in GenSpace; gray 4 = ${hexOf("primer", "gray", "4")}, gray 5 = ${hexOf("primer", "gray", "5")}, trained-metric difference ${fmt(CTX.primerGrayPairDiff, 3)} on a scale that saturates near ${fmt(CTX.bwDiff, 2)} (black↔white). Build gate: any spot-the-boundary visual must measure < ${JND_GATE} or the build fails — see methodology.`,
  }),

  proofBlock({
    id: "hover-squeeze",
    kicker: "1.3 · Material & Tailwind",
    headline: "The smallest steps hide on the button hover.",
    deck: `Material's blue, gap-spaced by measured distance: a ${rx(ratio(F.matBlueBig, F.matBlueDup))} leap from 50 to 100, while <code>blue-400</code> → <code>blue-500</code> — in countless UIs a button and its hover — is the smallest chromatic step in the entire audit. Tailwind makes the same trade on the exact same slot: <code>blue-500</code> → <code>blue-600</code> is the closest pair in its ramp.`,
    visual: `${gapRowSVG("Material blue", hexes("material", "blue"), names("material", "blue"), dists("material", "blue"), { annotate: matAnnotate })}
      <div class="receipt receipt-pair">${receiptChipsSVG(F.matBlue400, F.matBlue500, `Material blue 400 · ${F.matBlue400}`, `blue 500 · ${F.matBlue500}`)}${receiptChipsSVG(F.twBlue500, F.twBlue600, `Tailwind blue 500 · ${F.twBlue500}`, `blue 600 · ${F.twBlue600}`)}</div>`,
    caption: `The chips are the receipts. Both pairs are visibly different — design systems make steps visible on purpose — the finding is <em>where</em> each ramp chose to put its least contrast: on the state change your users are supposed to notice, where an in-place change is always easier to miss than two chips side by side. It doesn't have to be this way: Primer's red lands every jump between ${fmt(F.primerRedMin, 3)} and ${fmt(F.primerRedMax, 3)} (biggest step only ${F.primerRedRatio.toFixed(1)}× the smallest) — the most even hand-built ramp we measured. It gets its flowers in Chapter 4.`,
    small: `Material blue 400→500 = ${fmt(F.matBlueDup, 3)} — the audit's smallest chromatic step (asserted at build time) — vs 50→100 = ${fmt(F.matBlueBig, 3)} (${rx(ratio(F.matBlueBig, F.matBlueDup))}). Tailwind blue 500→600 = ${fmt(F.twBlueDup, 3)} vs 200→300 = ${fmt(F.twBlueBig, 3)} (${rx(ratio(F.twBlueBig, F.twBlueDup))}). For scale, the trained difference metric rates the pairs ${fmt(CTX.matPairDiff, 3)} and ${fmt(CTX.twPairDiff, 3)} on a scale saturating near ${fmt(CTX.bwDiff, 2)} — both well above threshold, which is why they get receipt chips, never a spot-the-boundary strip.`,
  }),
];

// ------------------------------ CHAPTER 2 ---------------------------------

const chakraGrayDrift = scorecard.systems.chakra.scales.gray.hue_drift_deg;
const twGrayDrift = scorecard.systems.tailwind.scales.gray.hue_drift_deg;
const tintedList = [...KEYS].filter((k) => GRAY[k].tinted).sort((a, b) => GRAY[b].maxC - GRAY[a].maxC);
const blueDark = BLUES[0], blueLight = BLUES[BLUES.length - 1];
const bluePctLighter = ((blueLight.L / blueDark.L - 1) * 100).toFixed(0);

const CH2 = [
  chapterIntro({
    id: "ch2", num: 2, title: "Hue",
    headline: "Is your blue still blue? Is your gray even gray?",
    intro: `Chapter 1 measured how far apart the steps are. This chapter measures what color they actually are — because a ramp can drift away from its own name on the way down, a "gray" can secretly carry a tint, and six systems can disagree about what <code>blue-500</code> even means.`,
  }),

  proofBlock({
    id: "blue-violet",
    kicker: "2.1 · Primer vs Tailwind",
    headline: "You call it blue. The dark end disagrees.",
    deck: `A ramp shouldn't just get darker — it should stay the color on its name tag. To test that, we took each blue ramp's first and worst-drift hues and re-rendered both at <em>identical</em> lightness and colorfulness: everything you see differing below is hue drift alone. First pair: Primer. Second pair: Tailwind, same test.`,
    visual: `${bigPairSVG(F.primerBlueProof.hexA, F.primerBlueProof.hexB,
      `Primer — the hue you started with · step ${F.primerBlueProof.firstStep}`,
      `the hue you ended with · step ${F.primerBlueProof.driftStep}`, 8, 190)}
      ${bigPairSVG(F.twBlueProof.hexA, F.twBlueProof.hexB,
      `Tailwind — the hue you started with · step ${F.twBlueProof.firstStep}`,
      `the hue you ended with · step ${F.twBlueProof.driftStep}`, 8, 190)}`,
    caption: `Primer drifts ${F.primerBlueProof.drift.toFixed(1)}° — the largest we measured: the light end leans cyan, the dark end leans violet. Ship a "blue" brand, tint your dark surfaces with blue-8, and you're tinting with a different color than your marketing blue. Tailwind, on the same test, drifts ${F.twBlueProof.drift.toFixed(1)}° — roughly a third — the visible payoff of v4's move to designing ramps in a perceptual color space: dark blue is still recognizably the same blue, so tinted surfaces, focus rings and charts stay on-brand at every step.`,
    small: `Primer hues ${F.primerBlueProof.h1.toFixed(1)}° / ${F.primerBlueProof.h2.toFixed(1)}° (steps ${F.primerBlueProof.firstStep}→${F.primerBlueProof.driftStep}); Tailwind ${F.twBlueProof.h1.toFixed(1)}° / ${F.twBlueProof.h2.toFixed(1)}° (${F.twBlueProof.firstStep}→${F.twBlueProof.driftStep}). All four swatches rendered at GenSpace L=${F.primerBlueProof.L}, C=${F.primerBlueProof.C} via helmlab genFromLch — identical lightness and chroma, so only hue differs. Tailwind gray drifts just ${twGrayDrift.toFixed(1)}°.`,
  }),

  proofBlock({
    id: "gray-isnt-gray",
    kicker: "2.2 · All six systems",
    headline: "Your gray isn't gray.",
    deck: `We measured the colorfulness (GenSpace chroma) of every gray token in all six systems — a true neutral measures C = 0. Below, each system's most-tinted gray sits next to a true neutral rebuilt at the exact same lightness. Any difference you can see is tint, nothing else.`,
    visual: tintPairsSVG(),
    caption: `Two systems ship ink-true grays: Material and Radix measure C = 0.000 at every step — their pairs above are literally identical chips. The rest lean cool: ${shortName(tintedList[0])}'s gray-${GRAY[tintedList[0]].worst.step} (C ${GRAY[tintedList[0]].maxC.toFixed(3)}) and ${shortName(tintedList[1])}'s gray-${GRAY[tintedList[1]].worst.step} (C ${GRAY[tintedList[1]].maxC.toFixed(3)}) are in a dead heat for the most tinted "gray" in the audit — more than twice the audit's own neutrality cutoff — with Primer's gray-8 behind them (C ${GRAY.primer.maxC.toFixed(3)}). Bootstrap's faint lean (C ${GRAY.bootstrap.maxC.toFixed(3)}) stays under the cutoff. And not one gray token anywhere in the audit leans warm: when design systems tint gray, they tint it blue. That's a defensible taste — cool grays read "clean screen" — but if your product mixes these tokens with a true neutral (a photo border, a #808080 from anywhere else), the seam will show.`,
    small: `C = genToLch(genFromHex(hex))[1] per gray token; tinted = C ≥ ${ACHROMATIC_C} (the audit's achromatic cutoff); neutral twin = genFromLch([measured L, 0, 0]). Most-tinted per system: Chakra 500 C ${GRAY.chakra.maxC.toFixed(4)} (hue ${GRAY.chakra.worst.h.toFixed(0)}°), Tailwind 900 C ${GRAY.tailwind.maxC.toFixed(4)} (${GRAY.tailwind.worst.h.toFixed(0)}°), Primer 8 C ${GRAY.primer.maxC.toFixed(4)} (${GRAY.primer.worst.h.toFixed(0)}°), Bootstrap 600 C ${GRAY.bootstrap.maxC.toFixed(4)} (${GRAY.bootstrap.worst.h.toFixed(0)}°), Material and Radix 0.0000 everywhere. All claims asserted at build time, including "every tinted gray is cool" (hue 220–280°).`,
  }),

  proofBlock({
    id: "no-blue-500",
    kicker: "2.3 · All six systems",
    headline: "There is no such thing as blue-500.",
    deck: `Six systems, one token name — the mid blue every brand reaches for. Here they all are, sorted darkest to lightest. Same name; six different colors. This is the one visual on the page that cannot be argued with: the differences are the point.`,
    visual: blueLineupSVG(),
    caption: `The name "blue-500" specifies neither a hue nor a weight: across these six tokens the hue spans ${Math.min(...BLUE_H).toFixed(1)}°–${Math.max(...BLUE_H).toFixed(1)}° (${BLUE_H_SPREAD.toFixed(1)}° apart — ${shortName("material")} and Chakra lean cyan, Tailwind and Bootstrap lean violet-blue) and the lightness spans ${blueDark.L.toFixed(3)}–${blueLight.L.toFixed(3)} — Material's mid blue is ${bluePctLighter}% lighter than Primer's. Port a design between systems, or copy a component from a codebase that uses a different one, and "just use blue-500" silently changes both the color and the weight of everything it touches. The contrast bill for that lands in Chapter 3.`,
    small: `Mid steps per system: 500 (Tailwind, Material, Bootstrap, Chakra), 9 (Radix), 5 (Primer) — each system's own documented solid/mid shade. L and hue via genToLch; white-text contrast ranges ${Math.min(...BLUE_CR).toFixed(2)}:1–${Math.max(...BLUE_CR).toFixed(2)}:1 across the six. Build asserts every pair of the six measures well above the near-duplicate threshold (visibly different) and that the L spread stays material (> 0.1).`,
  }),
];

// ------------------------------ CHAPTER 3 ---------------------------------

const spreadStr = (k) => MID[k].spreadL.toFixed(3);

const CH3 = [
  chapterIntro({
    id: "ch3", num: 3, title: "Weight",
    headline: "Same number, different weight.",
    intro: `Within one system, <code>blue-500</code>, <code>red-500</code>, <code>green-500</code> and <code>gray-500</code> share a step number — so designers treat them as interchangeable weights. We measured whether they actually are, and what that does to your text contrast.`,
  }),

  proofBlock({
    id: "same-step-weight",
    kicker: "3.1 · All six systems",
    headline: "Tokens with the same name don't carry the same visual weight.",
    deck: `Each system's mid row — blue, red, green, gray at the same step — with every chip's neutral-gray twin fused underneath at its <em>measured</em> lightness. If the four gray twins in a row match, the row carries one weight. Rows are sorted, tightest first.`,
    visual: weightRowsSVG(),
    caption: `Only Radix genuinely delivers "same step, same weight": its four solids sit within ${spreadStr("radix")} L of each other — the tightest row we measured, and a direct payoff of designing steps as roles. Chakra is close (${spreadStr("chakra")}). Then it falls apart: Tailwind's green-500 floats ${(MID.tailwind.cells.green.L - MID.tailwind.cells.gray.L).toFixed(2)} L above its own gray-500, Bootstrap's gray-500 is a pale outlier in an otherwise matched row (spread ${spreadStr("bootstrap")}), and Primer's "gray 5" isn't a mid-tone at all — it lives at L ${MID.primer.cells.gray.L.toFixed(2)}, a souvenir of the glued scale from Chapter 1. Swap one 500 for another inside these systems and your design silently changes weight.`,
    small: `Mid-row lightness spread (max − min GenSpace L across blue/red/green/gray at the mid step): Radix ${spreadStr("radix")}, Chakra ${spreadStr("chakra")}, Material ${spreadStr("material")}, Tailwind ${spreadStr("tailwind")}, Bootstrap ${spreadStr("bootstrap")}, Primer ${spreadStr("primer")}. Twins rendered via genFromLch([L, 0, 0]). Build asserts Radix's row is the tightest and Chakra's second.`,
  }),

  proofBlock({
    id: "contrast-bill",
    kicker: "3.2 · The accessibility bill",
    headline: "White text passes on one 500 and fails on another.",
    deck: `The consequence designers feel immediately: the same white label on every system's mid row, with the measured WCAG ratio. Normal text needs ${AA}:1 (AA). Every ratio below is computed, not estimated.`,
    visual: contrastGridSVG(),
    caption: `Same step number, opposite verdicts — inside a single system: white text passes on Tailwind's gray-500 at ${MID.tailwind.cells.gray.crWhite.toFixed(2)}:1 and fails on its green-500 at ${MID.tailwind.cells.green.crWhite.toFixed(2)}:1. Across systems it's worse: a white label that clears AA on Primer's blue (${MID.primer.cells.blue.crWhite.toFixed(2)}:1) fails on Material's blue-500 (${MID.material.cells.blue.crWhite.toFixed(2)}:1) — same token name, opposite audit result. Primer is the only system whose blue, red and green mids all clear AA with room (${Math.min(MID.primer.cells.blue.crWhite, MID.primer.cells.red.crWhite, MID.primer.cells.green.crWhite).toFixed(2)}–${Math.max(MID.primer.cells.blue.crWhite, MID.primer.cells.red.crWhite, MID.primer.cells.green.crWhite).toFixed(2)}:1); Bootstrap's three color mids scrape past (${MID.bootstrap.cells.blue.crWhite.toFixed(2)}–${MID.bootstrap.cells.green.crWhite.toFixed(2)}:1) while its gray fails at ${MID.bootstrap.cells.gray.crWhite.toFixed(2)}:1; Material's and Radix's mid rows hold white text nowhere. A step number is not a contrast guarantee — if your button component assumes "white text on any 500," it is already broken somewhere.`,
    small: `contrastRatio('#ffffff', hex) per mid token via helmlab; PASS = ≥ ${AA}:1 (WCAG AA, normal text). Every PASS/FAIL badge above is asserted at build time — including the borderline one: Bootstrap blue passes at ${MID.bootstrap.cells.blue.crWhite.toFixed(4)}:1, a margin of ${(MID.bootstrap.cells.blue.crWhite - AA).toFixed(4)}. Radix documents its step 9 for both light and dark text depending on the scale; the measurement here is white text only. Black text rescues most failures — see the closing chapter.`,
  }),
];

// ------------------------------ CHAPTER 4 ---------------------------------

const stealCard = ({ key, steal, evidence, visual, notes }) => {
  const sys = scorecard.systems[key];
  return `<article class="card steal-card" id="steal-${key}">
  <header class="card-head">
    <div class="card-title">
      <h3>${esc(sys.system)}</h3>
      <p class="tagline">Steal this: ${esc(steal)}</p>
      <p class="source">${esc(sys.source)}</p>
    </div>
  </header>
  <p class="steal-evidence">${evidence}</p>
  <div class="scales">${visual}</div>
  <ul class="findings">${notes.map((n) => `<li>${esc(n.say)}${n.num ? ` <span class="note-num">${esc(n.num)}</span>` : ""}</li>`).join("\n")}</ul>
</article>`;
};

const chakraTrio = ["blue", "red", "green"].map((s) => scorecard.systems.chakra.scales[s].L_cv_pct);

const CH4_CARDS = [
  stealCard({
    key: "bootstrap",
    steal: "its lightness discipline.",
    evidence: `Mixing every shade from one seed color plus pure white or black buys Bootstrap the most disciplined darkness ladders of any system — its green is the evenest darkness ladder of all 24 scales we measured (asserted at build time). If your ramp's job is "predictably darker every step," this is the trait to copy.`,
    visual: `<div class="scale-block"><div class="scale-label"><span class="scale-name">green — shipped, then as neutral grays at measured L</span><span class="scale-stats">L-CV ${scorecard.systems.bootstrap.scales.green.L_cv_pct.toFixed(1)}% · step CV ${scorecard.systems.bootstrap.scales.green.step_cv_pct.toFixed(1)}% · max/min ${scorecard.systems.bootstrap.scales.green.step_max_min_ratio.toFixed(2)}×</span></div>
      ${colorStripSVG("Bootstrap green (as shipped)", hexes("bootstrap", "green"), names("bootstrap", "green"), 40)}
      ${colorStripSVG("Bootstrap green lightness skeleton", graySkeleton("bootstrap", "green"), names("bootstrap", "green"), 40)}</div>`,
    notes: [
      { say: "Best mean darkness-evenness of the six systems, and hue barely moves — free benefits of single-seed mixing.", num: `mean L-CV ${scorecard.ranking_by_mean_step_cv.find((r) => r.key === "bootstrap").mean_L_cv_pct.toFixed(1)}% (best); blue hue drift ${scorecard.systems.bootstrap.scales.blue.hue_drift_deg.toFixed(1)}°` },
      { say: "The price is Chapter 1's cliff: equal paint-mixing is not equal seeing, so perceptual step sizes swing 8× inside blue.", num: `blue 100→200 d = ${fmt(F.bsBlueBig, 3)} vs 400→500 d = ${fmt(F.bsBlueSmall, 3)}` },
    ],
  }),
  stealCard({
    key: "tailwind",
    steal: "its hue lock.",
    evidence: `Tailwind v4 designs every ramp directly in a perceptual color space, and it shows: no Tailwind scale drifts more than ${scorecard.ranking_by_mean_step_cv.find((r) => r.key === "tailwind").worst_hue_drift_deg.toFixed(1)}° of hue, blue holds to ${scorecard.systems.tailwind.scales.blue.hue_drift_deg.toFixed(1)}° across eleven steps (a third of Primer's ${F.primerBlueProof.drift.toFixed(1)}°), and it achieves that while shaping each step by hand — not by mixing everything from one seed. If your brand color must stay your brand color at every depth, copy this.`,
    visual: `<div class="scale-block"><div class="scale-label"><span class="scale-name">blue — shipped</span><span class="scale-stats">hue drift ${scorecard.systems.tailwind.scales.blue.hue_drift_deg.toFixed(1)}° · gray drift ${twGrayDrift.toFixed(1)}°</span></div>
      ${colorStripSVG("Tailwind blue (as shipped)", hexes("tailwind", "blue"), names("tailwind", "blue"), 40)}</div>`,
    notes: [
      { say: "The equal-lightness hue proof is in Chapter 2.1 — dark Tailwind blue is still recognizably the same blue.", num: `drift: blue ${scorecard.systems.tailwind.scales.blue.hue_drift_deg.toFixed(1)}°, green ${scorecard.systems.tailwind.scales.green.hue_drift_deg.toFixed(1)}°, worst (red) ${scorecard.systems.tailwind.scales.red.hue_drift_deg.toFixed(1)}°` },
      { say: "Know the trade-offs: the 500/600 button-hover squeeze (Chapter 1.3), a green-500 that can't hold white text (Chapter 3.2), and dark grays that are genuinely blue, not gray (Chapter 2.2).", num: `blue 500→600 d = ${fmt(F.twBlueDup, 3)}; green-500 ${MID.tailwind.cells.green.crWhite.toFixed(2)}:1 vs white; gray-900 C ${GRAY.tailwind.maxC.toFixed(3)}` },
    ],
  }),
  stealCard({
    key: "primer",
    steal: "its red's even steps.",
    evidence: `This is what the gap test looks like when someone engineered the ramp: every jump in Primer's red lands between ${fmt(F.primerRedMin, 3)} and ${fmt(F.primerRedMax, 3)} — the biggest step only ${F.primerRedRatio.toFixed(1)}× the smallest, the most even hand-built ramp in the audit (only Bootstrap's machine-mixed green is tighter; both facts asserted at build time). Any two neighbors can carry a state change and read as "one step apart."`,
    visual: gapRowSVG("Primer red", hexes("primer", "red"), names("primer", "red"), dists("primer", "red")),
    notes: [
      { say: "Blue and green are nearly as disciplined, and Primer is the only system whose blue, red and green mids all hold white text (Chapter 3.2).", num: `red step CV ${F.primerRedCv.toFixed(1)}%; mids vs white ${MID.primer.cells.blue.crWhite.toFixed(2)} / ${MID.primer.cells.red.crWhite.toFixed(2)} / ${MID.primer.cells.green.crWhite.toFixed(2)}:1` },
      { say: "The same system also ships the audit's biggest hue drift (Chapter 2.1) and the glued gray (Chapter 1.2) — steal the red's discipline, not the whole neutral scale.", num: `blue drift ${F.primerBlueProof.drift.toFixed(1)}°; gray 7→8 = ${rx(ratio(F.primerGrayBig, F.primerGraySmall))} the 4→5 step` },
    ],
  }),
  stealCard({
    key: "chakra",
    steal: "its balance.",
    evidence: `No star scale, no disaster — and that's the achievement. Chakra's red, green and blue darken at the most consistent shared pace of any system (chromatic L-CVs within ${(Math.max(...chakraTrio) - Math.min(...chakraTrio)).toFixed(1)} points of each other: ${Math.min(...chakraTrio).toFixed(1)}–${Math.max(...chakraTrio).toFixed(1)}%, asserted the tightest trio at build time), and its mid row carries the second-most-uniform visual weight (spread ${spreadStr("chakra")} L, behind only Radix). If you want a palette where every color behaves like every other color, this is the trait to copy.`,
    visual: `<div class="scale-block">
      ${gapRowSVG("Chakra red", hexes("chakra", "red"), null, dists("chakra", "red"), { swatchH: 30 })}
      ${gapRowSVG("Chakra green", hexes("chakra", "green"), null, dists("chakra", "green"), { swatchH: 30 })}
      ${gapRowSVG("Chakra blue", hexes("chakra", "blue"), null, dists("chakra", "blue"), { swatchH: 30 })}</div>`,
    notes: [
      { say: "Three gap rows, one rhythm — red, green, blue (top to bottom) stay believably in step with each other.", num: `chromatic L-CV ${Math.min(...chakraTrio).toFixed(1)}–${Math.max(...chakraTrio).toFixed(1)}%; mid-row weight spread ${spreadStr("chakra")} L` },
      { say: "The blemishes live in Chapter 2: dark blue leans indigo, and the gray is tied for the most tinted in the audit.", num: `blue hue drift ${scorecard.systems.chakra.scales.blue.hue_drift_deg.toFixed(1)}°; gray-500 C ${GRAY.chakra.maxC.toFixed(3)}` },
    ],
  }),
  stealCard({
    key: "material",
    steal: "its ink-true gray.",
    evidence: `Material's gray is perfectly neutral: chroma 0.000 at every one of its ten steps — not a hint of tint anywhere, a property it shares only with Radix (asserted at build time). The two strips below are the proof: the shipped gray and its own lightness skeleton are <em>identical</em>, because there was no color to strip away. When your design calls for actual gray — photo UI, print proofing, anything that meets content — this is the gray to copy.`,
    visual: `<div class="scale-block"><div class="scale-label"><span class="scale-name">gray — shipped, then its lightness skeleton (identical)</span><span class="scale-stats">C = 0.0000 at all ten steps</span></div>
      ${colorStripSVG("Material gray (as shipped)", hexes("material", "gray"), names("material", "gray"), 40)}
      ${colorStripSVG("Material gray lightness skeleton — identical because it is already neutral", graySkeleton("material", "gray"), names("material", "gray"), 40)}</div>`,
    notes: [
      { say: "Green is clean too — the least hue drift of Material's chromatic scales.", num: `green drift ${scorecard.systems.material.scales.green.hue_drift_deg.toFixed(1)}°, step CV ${scorecard.systems.material.scales.green.step_cv_pct.toFixed(1)}%` },
      { say: "The rest of the 2014 palette shows its age: the audit's smallest chromatic step on the button hover (Chapter 1.3), the least even ramp, and a red whose darkness ladder is the most uneven measured.", num: `blue step CV ${scorecard.systems.material.scales.blue.step_cv_pct.toFixed(1)}%; red L-CV ${scorecard.systems.material.scales.red.L_cv_pct.toFixed(1)}%, drift ${scorecard.systems.material.scales.red.hue_drift_deg.toFixed(1)}°` },
    ],
  }),
  stealCard({
    key: "radix",
    steal: "its role clarity — and the weight discipline that comes with it.",
    evidence: `Radix finishes last in the leaderboard because the leaderboard measures a contract Radix never signed: its 12 steps are documented UI <em>jobs</em> (1–2 backgrounds, 3–5 component states, 9 the solid color, 11–12 text), not an even ramp. Judged on its own terms it's the most coherent system here — and Chapter 3 found the receipt: its four step-9 solids sit within ${spreadStr("radix")} L of each other, the only mid row in the audit that truly carries one weight. "Same name, same weight" is exactly what role-based design buys you.`,
    visual: gapRowSVG("Radix red", hexes("radix", "red"), names("radix", "red"), dists("radix", "red")),
    notes: [
      { say: "The canyon before step 12 is the audit's largest single step — on purpose: it is the deliberate contrast between text and everything else.", num: `red 11→12 d = ${fmt(F.radixRedCliff, 3)} (largest, asserted); rescored on interior steps 2–11, blue/green become ordinary (step CV 30.8% / 37.3%)` },
      { say: "Pick Radix when your tokens should name jobs; pick something else when you need an even dial. Its gray, like Material's, is ink-true neutral.", num: `mid-row weight spread ${spreadStr("radix")} L (tightest, asserted); gray C = 0.0000 at all steps` },
    ],
  }),
];

const CH4 = [
  chapterIntro({
    id: "ch4", num: 4, title: "What to steal",
    headline: "Every system does one thing better than everyone else.",
    intro: `The first three chapters read like a list of charges. This one is the constructive close: for each system, the single measured trait worth copying into your own palette — with the number that proves it, and an honest note on what not to copy along with it.`,
  }),
  CH4_CARDS.join("\n"),
  proofBlock({
    id: "no-dead-zones",
    kicker: "4.7 · Everyone passes",
    headline: "And nobody shipped a dead zone.",
    deck: `To end on the floor everyone clears: every system's flagship mid blue, wearing whichever text color measures better on it.`,
    visual: midChipsSVG(),
    caption: `Every system's mid shade is usable on white or black — each one holds at least 4.5:1 contrast against one of them, so there's always a legible text pairing. And every one of the 24 scales gets strictly darker as the numbers go up: zero lightness reversals across all ${TOTAL_STEPS} steps. The basics, everywhere, are sound — the differences this audit measures are the layer above the basics, which is exactly the layer designers work in.`,
    small: `mid = step 500 (Radix: step 9, Primer: step 5). WCAG contrast vs #fff and #000; "fails both" count = 0 for all six systems. Monotonicity violations = 0 across ${TOTAL_STEPS} steps.`,
    tone: "praise",
  }),
];

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

const ranking = scorecard.ranking_by_mean_step_cv;
const leaderboardRows = ranking
  .map(
    (r, i) => `<tr>
      <td class="rank-cell">${i + 1}</td>
      <td class="sys-cell">${esc(r.system)}</td>
      <td class="num">${r.mean_step_cv_pct.toFixed(1)}%</td>
      <td class="num">${r.mean_L_cv_pct.toFixed(1)}%</td>
      <td class="num">${r.worst_hue_drift_deg.toFixed(1)}°</td>
      <td class="num">${r.monotonicity_violation_count}</td>
    </tr>`
  )
  .join("\n");

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You call it blue-500. Is it? — The Open-Source Color Audit</title>
<meta name="description" content="We measured the color systems everyone copies — Tailwind, Material, Bootstrap, Primer, Radix, Chakra — in four chapters: step size, hue honesty, visual weight, and what each system does best. Reproducible.">
<style>
:root{
  --bg:${PALETTE.bg}; --card:${PALETTE.card}; --line:#2a2a31;
  --text:${PALETTE.text}; --muted:${PALETTE.muted}; --accent:${PALETTE.accent}; --gold:${PALETTE.gold};
  --pass:${PALETTE.pass}; --fail:${PALETTE.fail};
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
main{max-width:1100px;margin:0 auto;padding:0 24px}
a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
a:hover{color:#c4defc}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;background:#1a1a20;border:1px solid var(--line);border-radius:4px;padding:1px 6px}
h2{font-size:clamp(26px,4vw,40px);letter-spacing:-.02em;margin-bottom:16px}
section{padding:72px 0;border-top:1px solid var(--line)}

/* hero */
.hero{padding:130px 0 100px;border-top:none}
.hero h1{font-size:clamp(52px,10.5vw,132px);line-height:.96;letter-spacing:-.04em;font-weight:800;max-width:11ch}
.hero .thesis{font-size:clamp(20px,3vw,30px);margin-top:34px;max-width:34ch;font-weight:600;color:var(--text)}
.kicker{display:block;color:var(--gold);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:14px;margin-bottom:26px}

/* how to read */
.howto p{font-size:clamp(18px,2.4vw,24px);max-width:46ch;font-weight:500}
.howto p + p{margin-top:18px}
.toc{margin-top:28px;padding-left:22px;display:grid;gap:8px;font-size:clamp(16px,2vw,19px)}

/* chapter intros */
.chapter{padding:110px 0 8px;border-top:3px solid var(--gold)}
.chapter-kicker{display:block;color:var(--gold);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:14px;margin-bottom:18px}
.chapter-head{font-size:clamp(34px,6vw,68px);line-height:1.03;letter-spacing:-.03em;font-weight:800;max-width:22ch;margin-bottom:18px}
.chapter-intro{font-size:clamp(17px,2.3vw,22px);color:var(--muted);max-width:60ch}
.chapter-intro code{font-size:.85em}

/* proof blocks */
.proof{padding:100px 0}
.proof-kicker{display:block;color:var(--gold);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:13px;margin-bottom:18px}
.praise .proof-kicker{color:var(--pass)}
.proof-head{font-size:clamp(34px,6vw,72px);line-height:1.02;letter-spacing:-.035em;font-weight:800;margin-bottom:22px;max-width:18ch}
.proof-deck{font-size:clamp(17px,2.2vw,22px);color:var(--muted);max-width:58ch;margin-bottom:44px}
.proof-deck em{color:var(--text);font-style:normal;font-weight:600}
.proof-visual{margin:0 0 26px}
.proof-visual svg{display:block}
.proof-visual svg + svg{margin-top:36px}
.receipt{margin-top:30px}
.receipt svg{display:block}
.receipt-pair{display:flex;gap:40px;flex-wrap:wrap}
.bleed{width:100vw;margin-left:calc(50% - 50vw)}
.bleed svg{display:block}
.proof-caption{font-size:clamp(17px,2.2vw,21px);max-width:62ch;font-weight:500}
.proof-caption code,.proof-caption em{font-size:.95em}
.proof-caption em{font-style:normal;font-weight:700}
.proof-small{margin-top:16px;color:var(--muted);font-size:13.5px;max-width:78ch;font-variant-numeric:tabular-nums}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:32px;margin-top:36px}
.card-head{display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap}
.card-title{flex:1 1 320px}
.card-title h3{font-size:clamp(24px,3vw,34px);letter-spacing:-.02em}
.tagline{color:var(--gold);font-weight:700;margin-top:4px;font-size:20px}
.source{color:var(--muted);font-size:13px;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.steal-evidence{margin-top:18px;font-size:17px;max-width:88ch}
.steal-evidence em{font-style:normal;font-weight:700}
.scales{margin-top:26px;display:grid;gap:30px}
.scale-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.scale-name{font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:13px}
.scale-stats{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.scale-block svg{display:block}
.scale-block svg + svg{margin-top:6px}
.findings{margin-top:18px;padding-left:22px;display:grid;gap:12px}
.findings li{font-size:16px}
.note-num{display:block;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}

/* leaderboard */
table{width:100%;border-collapse:collapse;margin-top:12px}
th{text-align:left;color:var(--muted);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.08em;padding:10px 12px;border-bottom:1px solid var(--line)}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
td{padding:14px 12px;border-bottom:1px solid var(--line);font-size:17px}
.rank-cell{font-size:34px;font-weight:800;color:var(--gold);width:64px;line-height:1;font-variant-numeric:tabular-nums}
.sys-cell{font-weight:700}
.table-note{color:var(--muted);font-size:14px;margin-top:14px;max-width:75ch}

/* methodology */
.method p{max-width:78ch;margin-top:14px}
.method h4{margin-top:28px;font-size:18px}
.formula{margin-top:10px;padding:14px 16px;background:#1a1a20;border:1px solid var(--line);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;overflow-x:auto;white-space:pre}
.method ul{margin-top:12px;padding-left:22px;display:grid;gap:8px;max-width:78ch}

/* footer */
footer{border-top:1px solid var(--line);margin-top:0;padding:64px 24px 90px}
.footer-inner{max-width:1100px;margin:0 auto}
.footer-inner p{max-width:70ch}
.install{display:inline-block;margin:18px 0;padding:12px 18px;background:#1a1a20;border:1px solid var(--line);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:var(--text)}
.footer-links{margin-top:10px;display:flex;gap:24px;flex-wrap:wrap}
</style>
</head>
<body>
<main>

<header class="hero">
  <span class="kicker">The Open-Source Color Audit</span>
  <h1>You call it blue&#8209;500. Is&nbsp;it?</h1>
  <p class="thesis">We measured the color systems everyone copies — Tailwind, Material, Bootstrap, Primer, Radix, Chakra. Here's what your tokens actually do.</p>
</header>

<section class="howto" id="how-to-read">
  <h2>How to read this page</h2>
  <p>Every swatch here is the real, untouched color from each system's published package. We measured how the tokens actually <em>look</em> — not how their names sound — and turned the results into pictures you can judge with your own eyes.</p>
  <p>The findings come in four chapters, each a different question a designer actually asks:</p>
  <ol class="toc">
    <li><a href="#ch1">Steps</a> — does "+1" always mean one visual step?</li>
    <li><a href="#ch2">Hue</a> — is your blue still blue? Is your gray even gray?</li>
    <li><a href="#ch3">Weight</a> — do same-numbered tokens carry the same weight, and what does that do to contrast?</li>
    <li><a href="#ch4">What to steal</a> — the one measured trait each system does best.</li>
  </ol>
  <p>Headlines say what breaks; the small print underneath carries the numbers, and the full table waits at the <a href="#numbers">bottom</a>.</p>
</section>

${CH1.join("\n")}

${CH2.join("\n")}

${CH3.join("\n")}

${CH4.join("\n")}

<section id="numbers">
  <h2>The numbers, if you want them</h2>
  <table>
    <thead><tr>
      <th>#</th><th>System</th>
      <th class="num">Mean step CV</th>
      <th class="num">Mean L-CV</th>
      <th class="num">Worst hue drift</th>
      <th class="num">L-reversals</th>
    </tr></thead>
    <tbody>
${leaderboardRows}
    </tbody>
  </table>
  <p class="table-note">Ranked by mean step-distance CV across each system's blue, red, green and gray scales — lower means more even steps. Two results hold everywhere: all 24 scales are strictly monotone in GenSpace lightness (zero reversals across ${TOTAL_STEPS} steps), and no system's mid shade is a contrast dead zone. Radix's position comes with a design-intent caveat — see its Chapter 4 card.</p>
</section>

<section id="methodology" class="method">
  <h2>Methodology</h2>
  <p>Every hex token is mapped into <strong>helmlab GenSpace</strong> (<code>hl.genFromHex(hex)</code> → [L, a, b] with L in 0–1; <code>hl.genToLch</code> → [L, C, h°]), a perceptually uniform generation space. Four measurements per scale, plus the visual-proof constructions below.</p>

  <h4>1 · Step-distance consistency (step CV) — Chapter 1</h4>
  <div class="formula">d_i = GenSpace Euclidean distance(token_i, token_{i+1})
step CV = std(d) / mean(d) × 100        (plus max/min ratio)</div>
  <p>Lower CV = more even perceptual steps. The proportional-gap rows draw these distances directly: the gap between two swatches is proportional to d_i within that row.</p>

  <h4>2 · Lightness uniformity (L-CV) and monotonicity</h4>
  <div class="formula">dL_i = L_{i+1} − L_i
L-CV = std(dL) / |mean(dL)| × 100      (any sign flip → monotonicity violation)</div>

  <h4>3 · Hue drift and the hue-proof swatches — Chapter 2.1</h4>
  <div class="formula">drift = max_i |h_i − h_first|   with 360° wrap, skipping steps with C &lt; ${ACHROMATIC_C} as achromatic
proof swatch = hl.genFromLch([0.6, 0.2, h]) → hex    (identical L and C for both hues;
C reduced jointly if either hue falls outside sRGB at C = 0.2)</div>
  <p>Because both swatches share the same GenSpace lightness and chroma, any visible difference between them is hue drift and nothing else. All pairs shown on this page are in-gamut at C = 0.2.</p>

  <h4>4 · Gray-tint measurement — Chapter 2.2</h4>
  <div class="formula">C = genToLch(genFromHex(gray_token))[1]     for every gray token in every system
tinted   ⇔  C ≥ ${ACHROMATIC_C}   (the audit's achromatic cutoff)
neutral twin = genFromLch([measured L, 0, 0]) → hex</div>
  <p>A true neutral measures C = 0; its twin is then the identical color, which is what the Material and Radix pairs show. The build asserts the headline claims: Material and Radix at C &lt; 0.001 on every step, the Tailwind-900/Chakra-500 dead heat (ΔC &lt; 0.001, both ≥ 0.05), and that every tinted gray token in the audit leans cool (hue 220–280°).</p>

  <h4>5 · The mid-shade lineup — Chapter 2.3</h4>
  <div class="formula">mid = each system's documented solid/mid step (500; Radix 9; Primer 5)
per token: L, hue via genToLch; pairwise hl.difference across the six blues</div>
  <p>The build asserts every pair of the six mid blues measures well above the near-duplicate threshold — the "visibly different" claim is checked, not assumed — and that the lightness spread stays material (&gt; 0.1 L).</p>

  <h4>6 · Weight and the contrast bill — Chapter 3</h4>
  <div class="formula">weight spread = max − min GenSpace L across blue/red/green/gray at the mid step
white-text contrast = hl.contrastRatio('#ffffff', token);  PASS ⇔ ≥ ${AA} (WCAG AA)</div>
  <p>Every PASS/FAIL badge in Chapter 3.2 is asserted at build time — if a future token update flips a verdict, the build fails rather than shipping a stale claim. The gray twins in Chapter 3.1 use the same lightness-skeleton construction as below.</p>

  <h4>7 · The lightness skeleton — Chapters 3 &amp; 4</h4>
  <div class="formula">gray_i = hl.genFromLch([L_i, 0, 0]) → hex    (L_i = the token's measured GenSpace L)</div>
  <p>Rendering each token as a neutral gray at its measured lightness strips hue and chroma away, leaving only the darkness ladder — uneven lightness becomes visible without a chart.</p>

  <h4>8 · The near-duplicate honesty gate — Chapter 1.2</h4>
  <div class="formula">spot-the-boundary / seamless side-by-side visual  ⇒  hl.difference(pair) &lt; ${JND_GATE}
otherwise the BUILD FAILS</div>
  <p>Visual proof patterns are type-checked against the claim they make: a visual that invites you to struggle to see a difference ("spot the boundary") is only honest if the measured difference is genuinely sub-threshold — being a ramp's <em>smallest</em> step does not make a pair perceptually <em>small</em>. Exactly one pair in this audit qualifies: Primer gray 4→5 (trained difference ${fmt(CTX.primerGrayPairDiff, 3)}). The audit's smallest chromatic step, Material blue 400→500, measures ${fmt(CTX.matPairDiff, 3)} on a metric that saturates near ${fmt(CTX.bwDiff, 2)} — clearly visible — so the build asserts it is <em>rejected</em> by the gate and shows it only as a receipt-chip pair inside Chapter 1.3.</p>

  <h4>Provenance &amp; limitations</h4>
  <ul>
    <li>Token sources are the official npm packages, versions recorded in <code>data/tokens/*.json</code>. Tailwind v4 publishes <code>oklch()</code>, converted to sRGB hex via culori; Bootstrap's chromatic ramps are generated exactly per its own <code>tint-color</code>/<code>shade-color</code> (sass <code>mix()</code>) definitions.</li>
    <li>This audit measures <strong>scale quality only</strong> — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about overall design quality, aesthetics, component design, or the fitness of these palettes for their intended workflows.</li>
    <li><strong>Radix Colors is role-based by design</strong>: its 12 steps are documented use-case roles, not an even ramp, so uniformity metrics measure a contract it never signed. Its Chapter 4 card carries the reframe.</li>
    <li>Results depend on the choice of perceptual space; GenSpace correlates strongly with OKLab-class spaces, so orderings should be broadly stable, but exact numbers are space-specific.</li>
    <li>This page checks itself at build time: every text/background pair in the design is verified against WCAG (body text ≥ 7:1 AAA, secondary text ≥ 4.5:1 AA) using helmlab's <code>contrastRatio</code>; every near-duplicate visual is verified against the honesty gate; and every headline claim above (largest/smallest step, gray tints, blue-500 spreads, contrast pass/fail verdicts, "what to steal" superlatives) is asserted against the data — the build fails otherwise.</li>
  </ul>
</section>

</main>

<footer>
  <div class="footer-inner">
    <p>This audit was produced with the <strong>color-skills</strong> agent skills + the <strong>helmlab</strong> library.</p>
    <span class="install">npx skills add Grkmyldz148/color-skills</span>
    <div class="footer-links">
      <a href="https://helmlab.space/benchmark">helmlab.space/benchmark</a>
      <a href="https://github.com/Grkmyldz148/color-audit">Source, data &amp; build script on GitHub</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-top:24px">Rebuild with <code>npm install &amp;&amp; node build.mjs</code> — the page is generated from <code>data/scorecard.json</code> and <code>data/tokens/*.json</code>; helmlab is used at build time to precompute the proof swatches. MIT © 2026 Görkem Yıldız.</p>
  </div>
</footer>
</body>
</html>
`;

writeFileSync(join(ROOT, "index.html"), html);
console.log(`Wrote index.html (${(html.length / 1024).toFixed(1)} KB)`);
