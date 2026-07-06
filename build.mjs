#!/usr/bin/env node
// The Open-Source Color Audit — static site generator (v2, narrative edition).
// Reads data/scorecard.json + data/tokens/*.json and emits index.html.
// Single dependency: helmlab (used at BUILD TIME only, to precompute the
// hue-proof and grayscale-skeleton swatches — the emitted page is pure static
// HTML + inline SVG, no JS). Run: npm install && node build.mjs
//
// Numbers policy: every figure on the page is derived from data/scorecard.json,
// data/tokens/*.json, or computed here via helmlab. Nothing is invented.

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

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// Build-time contrast self-check: the page must practice what it preaches.
// Every text/background pair used in the design is verified here; the build
// FAILS if any pair drops below its target (body text AAA 7:1, all else AA 4.5:1).
// ---------------------------------------------------------------------------

const PALETTE = { bg: "#0b0b0d", card: "#121216", text: "#ececf1", muted: "#a8a8b3", accent: "#8fc1ff", gold: "#ffd166" };
const CONTRAST_CHECKS = [
  ["text", "bg", 7], ["text", "card", 7],
  ["muted", "bg", 4.5], ["muted", "card", 4.5],
  ["accent", "bg", 4.5], ["gold", "bg", 4.5], ["gold", "card", 4.5],
];
for (const [fg, bg, min] of CONTRAST_CHECKS) {
  const r = hl.contrastRatio(PALETTE[fg], PALETTE[bg]);
  if (r < min) throw new Error(`Contrast self-check FAILED: ${fg} on ${bg} = ${r.toFixed(2)}:1 < ${min}:1`);
}
console.log("Contrast self-check passed (body text AAA, secondary text AA+).");

// ---------------------------------------------------------------------------
// Derived facts (all pulled from scorecard/tokens — see numbers policy above)
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

// Hue-proof pairs: light-end hue vs drift-step hue, both re-rendered at the SAME
// lightness and chroma (L=0.6, C=0.2 in GenSpace LCh) so ONLY hue differs.
// If either hue is out of sRGB gamut at C=0.2, C is reduced for BOTH jointly.
function hueProofPair(key, scale) {
  const sc = scorecard.systems[key].scales[scale];
  const skipped = new Set(sc.achromatic_steps_skipped);
  const steps = stepsOf(key, scale);
  const first = steps.find((s) => !skipped.has(s));
  const at = sc.hue_drift_at_step;
  const h1 = hl.genToLch(hl.genFromHex(hexOf(key, scale, first)))[2];
  const h2 = hl.genToLch(hl.genFromHex(hexOf(key, scale, at)))[2];
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

// Facts used in the proof blocks
const F = {
  // Block 1: Material blue 400 vs 500 near-duplicates
  matBlue400: hexOf("material", "blue", "400"),
  matBlue500: hexOf("material", "blue", "500"),
  matBlueDup: dist("material", "blue", "400"),          // 0.0263
  matBlueBig: dist("material", "blue", "50"),           // 0.1621 (50→100)
  // Block 2: Bootstrap blue 8×
  bsBlueBig: dist("bootstrap", "blue", "100"),          // 0.3029
  bsBlueSmall: dist("bootstrap", "blue", "400"),        // 0.0380
  // Block 3 + 7: hue proofs
  primerBlueProof: hueProofPair("primer", "blue"),      // 27.6°
  twBlueProof: hueProofPair("tailwind", "blue"),        // 9.6°
  // Block 4: Tailwind 500/600 twins
  twBlue500: hexOf("tailwind", "blue", "500"),
  twBlue600: hexOf("tailwind", "blue", "600"),
  twBlueDup: dist("tailwind", "blue", "500"),           // 0.0451
  twBlueBig: dist("tailwind", "blue", "200"),           // 0.2194
  // Block 5: Primer glued neutral
  primerGraySmall: dist("primer", "gray", "4"),         // 0.0111
  primerGrayBig: dist("primer", "gray", "7"),           // 0.2060
  // Block 6: Material red L skeleton
  matRedLcv: scorecard.systems.material.scales.red.L_cv_pct, // 65.53
  matRedL: scorecard.systems.material.scales.red.L,
  // Block 8: Primer red praise
  primerRedCv: scorecard.systems.primer.scales.red.step_cv_pct,       // 16.87
  primerRedRatio: scorecard.systems.primer.scales.red.step_max_min_ratio, // 1.8
  primerRedMin: Math.min(...scorecard.systems.primer.scales.red.step_distances),
  primerRedMax: Math.max(...scorecard.systems.primer.scales.red.step_distances),
  // Block 10: Radix
  radixRedCliff: dist("radix", "red", "11"),            // 0.4349
};

// sanity: the "largest single step in the audit" claim
const ALL_D = Object.entries(scorecard.systems).flatMap(([k, s]) =>
  Object.values(s.scales).flatMap((sc) => sc.step_distances));
if (Math.abs(Math.max(...ALL_D) - F.radixRedCliff) > 1e-9)
  throw new Error("Fact check failed: Radix red 11→12 is no longer the largest step in the audit.");

// sanity: the "smallest chromatic step in the audit" claim (Finding 05).
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
  bwEuclid: hl.euclideanDistance("#000000", "#ffffff"),   // ~1.12
  matPairDiff: hl.difference(F.matBlue400, F.matBlue500), // ~0.044
  matPairEuclid: hl.euclideanDistance(F.matBlue400, F.matBlue500), // ~0.026
  twPairDiff: hl.difference(hexOf("tailwind", "blue", "500"), hexOf("tailwind", "blue", "600")), // ~0.072
  primerGrayPairDiff: hl.difference(hexOf("primer", "gray", "4"), hexOf("primer", "gray", "5")), // ~0.019
};

const TOTAL_STEPS = ALL_D.length;

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
  const SW = 46;               // swatch height
  const LABEL_H = stepNames ? 22 : 0;
  const H = SW + LABEL_H;
  const totalGap = W * 0.42;
  const sw = (W - totalGap) / n;
  const dSum = dists.reduce((a, b) => a + b, 0);
  let x = 0, out = "";
  const centers = [];
  hexes.forEach((hex, i) => {
    out += `<rect x="${x.toFixed(2)}" y="0" width="${sw.toFixed(2)}" height="${SW}" fill="${hex}"><title>${esc(
      `${label} ${stepNames ? stepNames[i] : i}: ${hex}`)}</title></rect>`;
    if (stepNames) {
      out += `<text x="${(x + sw / 2).toFixed(2)}" y="${SW + 16}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${esc(stepNames[i])}</text>`;
    }
    centers.push(x + sw / 2);
    if (i < n - 1) {
      const g = totalGap * (dists[i] / dSum);
      // hairline across the gap so the eye reads it as "distance traveled"
      out += `<line x1="${(x + sw).toFixed(2)}" y1="${SW / 2}" x2="${(x + sw + g).toFixed(2)}" y2="${SW / 2}" stroke="${PALETTE.line || "#2a2a31"}" stroke-width="2"><title>${esc(
        `${label} ${stepNames ? stepNames[i] + "→" + stepNames[i + 1] : ""}: perceptual distance ${dists[i].toFixed(4)}`)}</title></line>`;
      if (opts.annotate && opts.annotate[i] != null) {
        out += `<text x="${(x + sw + g / 2).toFixed(2)}" y="${SW / 2 - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="${PALETTE.gold}" font-family="ui-monospace,Menlo,monospace">${esc(opts.annotate[i])}</text>`;
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
  <text x="${w / 2}" y="${height + 21}" text-anchor="middle" font-size="14" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${esc(labelA)}</text>
  <text x="${w + gap + w / 2}" y="${height + 21}" text-anchor="middle" font-size="14" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${esc(labelB)}</text>
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
  <text x="${chipW / 2}" y="${chipH + 18}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${esc(labelA)}</text>
  <text x="${chipW + gap + chipW / 2}" y="${chipH + 18}" text-anchor="middle" font-size="12" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${esc(labelB)}</text>
</svg>`;
}

// Six mid-shade chips, each carrying legible sample text (white or black,
// whichever measures higher contrast against that chip).
function midChipsSVG() {
  const order = scorecard.ranking_by_mean_step_cv;
  const W = 1000, chipW = 150, chipH = 120, gap = (W - chipW * 6) / 5;
  let out = "";
  order.forEach((r, i) => {
    const sys = scorecard.systems[r.key];
    const mid = sys.scales.blue.mid; // blue mid as the representative "brand" shade
    const useWhite = mid.contrast_vs_white >= mid.contrast_vs_black;
    const ink = useWhite ? "#ffffff" : "#000000";
    const cr = useWhite ? mid.contrast_vs_white : mid.contrast_vs_black;
    const x = i * (chipW + gap);
    out += `<rect x="${x}" y="0" width="${chipW}" height="${chipH}" fill="${mid.hex}"><title>${esc(
      `${sys.system} blue ${mid.step} (${mid.hex}) — ${cr.toFixed(2)}:1 vs ${useWhite ? "white" : "black"}`)}</title></rect>
    <text x="${x + chipW / 2}" y="${chipH / 2 + 14}" text-anchor="middle" font-size="40" font-weight="700" fill="${ink}" font-family="system-ui,sans-serif">Aa</text>
    <text x="${x + chipW / 2}" y="${chipH + 22}" text-anchor="middle" font-size="13" fill="${PALETTE.muted}" font-family="system-ui,sans-serif">${esc(sys.system.replace(/ \(.*\)/, "").replace(" CSS v4", "").replace(" 5", "").replace(" Design", ""))}</text>
    <text x="${x + chipW / 2}" y="${chipH + 40}" text-anchor="middle" font-size="11" fill="${PALETTE.muted}" font-family="ui-monospace,Menlo,monospace">${cr.toFixed(1)}:1 ${useWhite ? "white" : "black"}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${chipH + 50}" width="100%" role="img" aria-label="Each system's mid blue with its best-contrast text color">${out}</svg>`;
}

PALETTE.line = "#2a2a31";

// convenience getters
const hexes = (k, s) => Object.values(tokens[k].scales[s]);
const names = (k, s) => Object.keys(tokens[k].scales[s]);
const dists = (k, s) => scorecard.systems[k].scales[s].step_distances;

// ---------------------------------------------------------------------------
// THE PROOF BLOCKS — headline (designer consequence), visual (the evidence),
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

const bsAnnotate = {};
{
  const st = names("bootstrap", "blue");
  bsAnnotate[st.indexOf("100")] = rx(ratio(F.bsBlueBig, F.bsBlueSmall));
  bsAnnotate[st.indexOf("400")] = "1×";
}
const twAnnotate = {};
{
  const st = names("tailwind", "blue");
  twAnnotate[st.indexOf("200")] = rx(ratio(F.twBlueBig, F.twBlueDup));
  twAnnotate[st.indexOf("500")] = "1×";
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

const proofBlocks = [

  // 1 — uneven steps (LEAD: a visual that cannot be falsified by looking) ----
  proofBlock({
    id: "whisper-shout",
    kicker: "Finding 01 · Bootstrap",
    headline: "One step whispers, another shouts.",
    deck: `Below, each gap is drawn exactly as wide as the measured perceptual distance between neighbors. Even scale, even gaps. This is Bootstrap's blue.`,
    visual: gapRowSVG("Bootstrap blue", hexes("bootstrap", "blue"), names("bootstrap", "blue"), dists("bootstrap", "blue"), { annotate: bsAnnotate }),
    caption: `The 100→200 jump is ${rx(ratio(F.bsBlueBig, F.bsBlueSmall))} the 400→500 jump — Bootstrap blue. The token names promise a staircase with even steps; what ships is one cliff at the light end and three whisper-small steps in the middle. The same "one shade darker" tweak buys ${rx(ratio(F.bsBlueBig, F.bsBlueSmall))} more visible change at 100 than at 400.`,
    small: `100→200 = ${fmt(F.bsBlueBig, 3)}, 400→500 = ${fmt(F.bsBlueSmall, 3)} in GenSpace. Bootstrap tints and shades by mixing RGB with white/black — equal paint-mixing is not equal seeing.`,
  }),

  // 2 — hue drift -----------------------------------------------------------
  proofBlock({
    id: "blue-violet",
    kicker: "Finding 02 · GitHub Primer",
    headline: "You call it blue. The dark end disagrees.",
    deck: `Primer's blue ramp doesn't just get darker — it quietly changes hue on the way down. To prove it's hue and nothing else, we re-rendered the ramp's first and last hue at <em>identical</em> lightness and colorfulness. Everything you see differing below is hue drift alone.`,
    visual: bigPairSVG(F.primerBlueProof.hexA, F.primerBlueProof.hexB,
      `the hue you started with · step ${F.primerBlueProof.firstStep}`,
      `the hue you ended with · step ${F.primerBlueProof.driftStep}`, 8),
    caption: `That's ${F.primerBlueProof.drift.toFixed(1)}° of hue drift — the largest we measured. The light end of Primer's blue leans cyan; the dark end leans violet. Ship a "blue" brand, tint your dark surfaces with blue-8, and you're tinting with a different color than your marketing blue.`,
    small: `Hues ${F.primerBlueProof.h1.toFixed(1)}° and ${F.primerBlueProof.h2.toFixed(1)}° from Primer blue steps ${F.primerBlueProof.firstStep} and ${F.primerBlueProof.driftStep}, both re-rendered at GenSpace L=${F.primerBlueProof.L}, C=${F.primerBlueProof.C} via helmlab genFromLch → ${F.primerBlueProof.hexA} vs ${F.primerBlueProof.hexB}.`,
  }),

  // 3 — glued neutral -------------------------------------------------------
  proofBlock({
    id: "glued-gray",
    kicker: "Finding 03 · GitHub Primer",
    headline: "One gray scale. Except it's two.",
    deck: `Primer's 14-step neutral behaves like two scales glued together: seven whisper-quiet light grays, a cliff, then a normal dark ramp.`,
    visual: gapRowSVG("Primer neutral", hexes("primer", "gray"), names("primer", "gray"), dists("primer", "gray"), { annotate: pgAnnotate }),
    caption: `Pick "the next gray down" near the top and the change is nearly too small to point at. Do it at the 7→8 seam and everything changes: that jump is ${rx(ratio(F.primerGrayBig, F.primerGraySmall))} the 4→5 jump. This isn't necessarily wrong — light-mode UIs need many whisper-quiet surface grays — but if you're choosing border and divider colors by nudging the step number, this ramp will not behave linearly. How quiet is the quiet end? See the next finding.`,
    small: `4→5 = ${fmt(F.primerGraySmall, 3)}, 7→8 = ${fmt(F.primerGrayBig, 3)} in GenSpace. The gaps above are the measured distances, to scale.`,
  }),

  // 4 — THE one and only spot-the-boundary hero ------------------------------
  proofBlock({
    id: "spot-the-boundary",
    kicker: "Finding 04 · GitHub Primer",
    headline: "Spot the boundary. Take your time.",
    deck: `Gray 4 meets gray 5 at the midpoint of this strip — no seam drawn. This is the only pair in the audit that has earned this visual: its measured difference is genuinely near threshold (${fmt(CTX.primerGrayPairDiff, 3)}, below the build's ${JND_GATE} near-duplicate gate). Every other "closest pair" we measured is plainly visible butted together — showing one this way would falsify the claim on sight.`,
    visual: `<div class="bleed">${boundaryStripSVG(hexOf("primer", "gray", "4"), hexOf("primer", "gray", "5"), `Primer gray 4 (${hexOf("primer", "gray", "4")}) meets gray 5 (${hexOf("primer", "gray", "5")}) at the midpoint of this strip`)}</div>`,
    caption: `Most people need a second look — that's what a genuinely near-threshold token pair looks like. Primer's gray 4→5 is ${(ratio(F.matBlueDup, F.primerGraySmall)).toFixed(1)}× closer than Material's famous blue 400/500, and the only step among all ${TOTAL_STEPS} where the eye and the metric agree there is almost nothing there. Two officially different design tokens; one color, for most practical purposes.`,
    small: `Gray 4 = ${hexOf("primer", "gray", "4")}, gray 5 = ${hexOf("primer", "gray", "5")}; GenSpace step distance ${fmt(F.primerGraySmall, 3)}, trained-metric difference ${fmt(CTX.primerGrayPairDiff, 3)} on a scale that saturates near ${fmt(CTX.bwDiff, 2)} (black↔white). Build gate: any spot-the-boundary visual on this page must measure < ${JND_GATE} or the build fails — see methodology.`,
  }),

  // 5 — Material blue: unevenness narrative, near-duplicate demoted to receipt
  proofBlock({
    id: "one-color",
    kicker: "Finding 05 · Material Design",
    headline: "The least even ramp saves its smallest step for the button hover.",
    deck: `Material's blue, gap-spaced by measured distance. The light end takes a ${rx(ratio(F.matBlueBig, F.matBlueDup))} leap from 50 to 100 — while <code>blue-400</code> and <code>blue-500</code>, in countless UIs a button and its hover state, sit closer together than any two chromatic tokens we measured.`,
    visual: `${gapRowSVG("Material blue", hexes("material", "blue"), names("material", "blue"), dists("material", "blue"), { annotate: matAnnotate })}
      <div class="receipt">${receiptChipsSVG(F.matBlue400, F.matBlue500, `blue 400 · ${F.matBlue400}`, `blue 500 · ${F.matBlue500}`)}</div>`,
    caption: `The chips are the receipt: 400→500 is the audit's smallest chromatic step — ${rx(ratio(F.matBlueBig, F.matBlueDup))} less change than the same ramp spends on 50→100. To be clear, the pair is visibly different (design systems make steps visible on purpose); the finding is where the ramp chose to put its least contrast — and an in-place state change is always easier to miss than two chips sitting side by side.`,
    small: `400→500 = ${fmt(F.matBlueDup, 3)} (helmlab GenSpace) — the smallest chromatic step measured in this audit (asserted at build time); 50→100 = ${fmt(F.matBlueBig, 3)}. For scale: the trained difference metric rates the pair ${fmt(CTX.matPairDiff, 3)} on a scale that saturates near ${fmt(CTX.bwDiff, 2)} (black↔white) — well above threshold, which is why this pair gets chips, not a spot-the-boundary strip.`,
  }),

  // 6 — Tailwind twins: closest pair as receipt inside the gap row -----------
  proofBlock({
    id: "twins",
    kicker: "Finding 06 · Tailwind CSS",
    headline: "The two shades you use most are the two closest together.",
    deck: `In countless Tailwind codebases, <code>blue-500</code> is the button and <code>blue-600</code> is its hover. They are the closest pair in the entire ramp.`,
    visual: `${gapRowSVG("Tailwind blue", hexes("tailwind", "blue"), names("tailwind", "blue"), dists("tailwind", "blue"), { annotate: twAnnotate })}
      <div class="receipt">${receiptChipsSVG(F.twBlue500, F.twBlue600, `blue 500 · ${F.twBlue500}`, `blue 600 · ${F.twBlue600}`)}</div>`,
    caption: `The ramp's closest pair, right on the default button-and-hover slot: the 200→300 jump is ${rx(ratio(F.twBlueBig, F.twBlueDup))} the 500→600 jump. A subtle hover is a legitimate design choice — just know the ramp made that choice for you. Red has the same squeeze, plus one huge cliff into 950.`,
    small: `500→600 = ${fmt(F.twBlueDup, 3)}, 200→300 = ${fmt(F.twBlueBig, 3)} in GenSpace; trained-metric difference for 500/600 = ${fmt(CTX.twPairDiff, 3)} (scale saturates near ${fmt(CTX.bwDiff, 2)}) — clearly visible side by side, hence chips rather than a boundary strip. Tailwind red 900→950 = ${fmt(dist("tailwind", "red", "900"), 3)}, the ramp's biggest jump.`,
  }),

  // 7 — L skeleton ----------------------------------------------------------
  proofBlock({
    id: "darkness-skeleton",
    kicker: "Finding 07 · Material Design",
    headline: "Halfway down, it nearly stops getting darker.",
    deck: `Strip the color away and render each token of Material's red as neutral gray at its <em>measured</em> lightness — the ramp's darkness skeleton. Top row: what ships. Bottom row: how dark each step actually is.`,
    visual: `<div class="stacked-strips">
      ${colorStripSVG("Material red (as shipped)", hexes("material", "red"), names("material", "red"), 56)}
      ${colorStripSVG("Material red (lightness skeleton — each step as neutral gray at its measured L)", graySkeleton("material", "red"), names("material", "red"), 56)}
    </div>`,
    caption: `Same step, different darkness jump. Material red darkens fast, then slows sharply: the four steps from 500 down to 900 cover less than half the lightness distance of the five from 50 down to 500. White text that passes on red-600 will behave very similarly on red-800 — and if your error-state hierarchy expects "darker = more severe," the bottom half of this ramp delivers it at less than half the rate of the top.`,
    small: `Measured GenSpace L: 500 = ${F.matRedL[5].toFixed(2)}, 700 = ${F.matRedL[7].toFixed(2)}, 900 = ${F.matRedL[9].toFixed(2)}. Lightness-step consistency (L-CV) ${F.matRedLcv.toFixed(1)}% — the most uneven chromatic darkness ladder in the audit. Grays rendered via helmlab genFromLch([L, 0, 0]).`,
  }),

  // 8 — praise: Tailwind hue ------------------------------------------------
  proofBlock({
    id: "stays-blue",
    kicker: "Finding 08 · Credit where due",
    headline: "Tailwind's blue never stops being blue.",
    deck: `Same test we ran on Primer: first-step hue vs worst-drift hue, re-rendered at identical lightness and colorfulness. Compare how far apart these read to Finding 02.`,
    visual: bigPairSVG(F.twBlueProof.hexA, F.twBlueProof.hexB,
      `the hue you started with · step ${F.twBlueProof.firstStep}`,
      `the hue you ended with · step ${F.twBlueProof.driftStep}`, 8),
    caption: `That's ${F.twBlueProof.drift.toFixed(1)}° of drift across eleven steps — you can see it when the two fields face each other like this, but it's roughly a third of Primer's ${F.primerBlueProof.drift.toFixed(1)}°. This is Tailwind's v4 move to designing ramps in a perceptual color space paying off: dark blue is still recognizably the same blue, so tinted dark surfaces, focus rings and charts stay on-brand at every step.`,
    small: `Hues ${F.twBlueProof.h1.toFixed(1)}° and ${F.twBlueProof.h2.toFixed(1)}° from Tailwind blue ${F.twBlueProof.firstStep} and ${F.twBlueProof.driftStep}, rendered at GenSpace L=${F.twBlueProof.L}, C=${F.twBlueProof.C} → ${F.twBlueProof.hexA} vs ${F.twBlueProof.hexB}. Tailwind gray drifts just ${scorecard.systems.tailwind.scales.gray.hue_drift_deg.toFixed(1)}°.`,
    tone: "praise",
  }),

  // 9 — praise: Primer red --------------------------------------------------
  proofBlock({
    id: "most-even",
    kicker: "Finding 09 · Credit where due",
    headline: "Primer red: the most even ramp we measured.",
    deck: `This is what the gap test looks like when someone engineered the ramp. Every "+1" means roughly the same thing to the eye.`,
    visual: gapRowSVG("Primer red", hexes("primer", "red"), names("primer", "red"), dists("primer", "red")),
    caption: `Every jump lands between ${fmt(F.primerRedMin, 3)} and ${fmt(F.primerRedMax, 3)} — the biggest step is only ${F.primerRedRatio.toFixed(1)}× the smallest, the tightest spread of any scale in the audit. You can pick any two neighbors for a state change and trust them to read as "one step apart." Primer's blue and green are nearly as disciplined, and all three mid shades hold white text.`,
    small: `Step consistency (CV) ${F.primerRedCv.toFixed(1)}%, max/min ${F.primerRedRatio.toFixed(1)}×. Primer mids vs white: blue ${scorecard.systems.primer.scales.blue.mid.contrast_vs_white.toFixed(2)}:1, red ${scorecard.systems.primer.scales.red.mid.contrast_vs_white.toFixed(2)}:1, green ${scorecard.systems.primer.scales.green.mid.contrast_vs_white.toFixed(2)}:1 — all ≥ 4.5:1 (WCAG AA).`,
    tone: "praise",
  }),

  // 10 — good news ----------------------------------------------------------
  proofBlock({
    id: "no-dead-zones",
    kicker: "Finding 10 · Everyone passes",
    headline: "Nobody shipped a dead zone.",
    deck: `Every system's flagship mid blue, wearing whichever text color measures better on it.`,
    visual: midChipsSVG(),
    caption: `Every system's mid shade is usable on white or black — each one holds at least 4.5:1 contrast against one of them, so there's always a legible text pairing. And every one of the 24 scales gets strictly darker as the numbers go up: zero lightness reversals across all ${TOTAL_STEPS} steps. The basics, everywhere, are sound.`,
    small: `mid = step 500 (Radix: step 9, Primer: step 5). WCAG contrast vs #fff and #000; "fails both" count = 0 for all six systems. Monotonicity violations = 0 across ${TOTAL_STEPS} steps.`,
    tone: "praise",
  }),

  // 11 — Radix caveat -------------------------------------------------------
  proofBlock({
    id: "radix-lens",
    kicker: "Finding 11 · Radix Colors",
    headline: "Radix comes last. The ranking is the wrong lens.",
    deck: `Run the gap test on Radix and it looks broken — tiny steps, then a canyon. It isn't broken. It's a different kind of system.`,
    visual: gapRowSVG("Radix red", hexes("radix", "red"), names("radix", "red"), dists("radix", "red")),
    caption: `Radix scores "worst" only because its 12 steps are jobs, not a ramp — steps 1–2 are backgrounds, 3–5 component states, 9 is the solid color, 11–12 are text. Judged as a ramp, that's the wrong lens; that canyon before step 12 is the deliberate contrast between text and everything else — the largest single step in the audit, on purpose. We show it for completeness: if you need an even ramp, Radix never promised you one. If you need steps that map to UI jobs, this is the point.`,
    small: `Radix red 11→12 = ${fmt(F.radixRedCliff, 3)} — the audit's largest step. Rescored on interior steps 2–11 only, blue and green become ordinary (step CV 30.8% / 37.3%); red (64.6%) and gray (97.6%) stay uneven either way.`,
  }),
];

// ---------------------------------------------------------------------------
// Per-system report cards — verdicts in designer language, numbers demoted
// to small captions. Visuals: shipped strip + lightness skeleton + gap row.
// ---------------------------------------------------------------------------

const CARDS = {
  chakra: {
    verdict: "The safe pick — no star scale, but nothing broken.",
    notes: [
      { say: "Nothing here will surprise you badly. Red, green and blue all darken at a believable, steady pace — the most consistent trio of color ramps in the audit.", num: "chromatic L-CV 18.2–19.0%, step CV 26.0–43.1%" },
      { say: "The dark blues stop being the blue you started with — 900 leans indigo. The darkest gray leans blue too: a deliberate cool-gray choice, but the strongest tint of any gray measured.", num: "blue hue drift 20.5° at 900; gray 19.1° at 900" },
      { say: "Light grays crowd together — the 100→200 step is a tenth of the mid-scale jumps that follow.", num: "gray 100→200 d = 0.020 vs 500→600 d = 0.227 (11.2×)" },
    ],
  },
  primer: {
    verdict: "The best color ramps in the audit — and a gray scale with a trapdoor.",
    notes: [
      { say: "Red is the most even ramp we measured, blue and green close behind — every “+1” means nearly the same visual jump. This was engineered, and it shows.", num: "red step CV 16.9%, max/min 1.8×; blue/green step CV 31.6% / 31.1%" },
      { say: "Every color's mid shade holds white text — the only system where that's true across blue, red and green.", num: "vs white: #0969da 5.19:1 · #cf222e 5.36:1 · #1a7f37 5.08:1" },
      { say: "The 14-step neutral is two scales glued together (Finding 03) — its 4→5 pair is the only genuinely near-threshold step in the audit (Finding 04) — and blue quietly changes hue on the way down, more than any scale here (Finding 02).", num: "gray 4→5 d = 0.011 vs 7→8 d = 0.206 (18.6×); blue drift 27.6°" },
    ],
  },
  bootstrap: {
    verdict: "Machine-mixed from one seed color — hue never moves, but the light blues pile up.",
    notes: [
      { say: "The darkness ladder is the most disciplined of any system and hue is nearly immovable — free benefits of mixing every shade from one seed plus pure white or black.", num: "mean L-CV 24.1% (best); blue hue drift 2.9°" },
      { say: "Green is the single best-behaved scale in the audit for even darkening.", num: "green L-CV 7.5%, step CV 14.8%, max/min 1.47×" },
      { say: "The price: three near-flat steps in the middle of blue and one cliff at the light end (Finding 01). Equal paint-mixing is not equal seeing.", num: "blue 100→200 d = 0.303 vs 400→500 d = 0.038 (8.0×)" },
    ],
  },
  tailwind: {
    verdict: "The truest hues in the audit — but 500 and 600 are the ramp's closest pair.",
    notes: [
      { say: "Blues stay blue, grays stay gray, and even the worst scale barely wanders — the v4 redesign in a perceptual color space shows (Finding 08).", num: "hue drift: blue 9.6°, gray 6.9°, worst (red) 13.2°" },
      { say: "The default button-and-hover pair is the closest pair in the ramp (Finding 06); red has the same squeeze plus a cliff into 950.", num: "blue 500→600 d = 0.045 vs 200→300 d = 0.219 (4.9×); red 900→950 d = 0.318" },
      { say: "The lightest grays sit a hair apart — most people will need a second look — and the mid shades are tuned dark-UI-first: green-500 is strong on black, weak on white.", num: "gray 50→100 d = 0.009 vs 400→500 d = 0.203 (22.1×); green-500 9.47:1 black / 2.22:1 white" },
    ],
  },
  material: {
    verdict: "A 2014 palette showing its age — the audit's smallest step mid-blue, a red that stops darkening.",
    notes: [
      { say: "Blue 400→500 is the smallest chromatic step in the audit (Finding 05) while 50→100 is a huge leap — the least even color ramp we measured.", num: "400→500 d = 0.026 vs 50→100 d = 0.162 (6.2×); step CV 68.9%" },
      { say: "Red barely darkens through its bottom half (Finding 07) and drifts hue on the way down.", num: "red L-CV 65.5% (most uneven measured); hue drift 20.8°" },
      { say: "Credit where due: green is clean, and the gray is perfectly neutral — not a hint of tint at any of its ten steps.", num: "green step CV 31.8%, drift 3.6°; gray fully achromatic in GenSpace" },
    ],
  },
  radix: {
    verdict: "Last in the table — because it's playing a different game: 12 jobs, not 12 even steps.",
    caveat: "Radix documents each of its 12 steps as a UI role (1–2 backgrounds, 3–5 component states, 9 solid, 11–12 text), not as an even ramp. Step-uniformity metrics measure a contract Radix never signed — its rank below is only meaningful if what you need is a ramp. See Finding 11.",
    notes: [
      { say: "The raw numbers are the audit's most extreme, but the giant jumps sit exactly where Radix's documented jobs change — the canyon before step 12 is deliberate text-vs-surface contrast.", num: "mean step CV 101.6%; red 11→12 d = 0.435, the audit's largest step" },
      { say: "Score only the interior steps and blue and green look ordinary; red and gray stay uneven either way.", num: "steps 2–11: blue 30.8%, green 37.3%, red 64.6%, gray 97.6%" },
      { say: "Within its own logic it's coherent: the solid step always lands mid-contrast and darkness never reverses. Pick Radix for roles; pick something else for a ramp.", num: "monotonicity violations 0; solid step 9 ≥ 3.1:1 vs white and black" },
    ],
  },
};

const STRIP_SCALES = ["blue", "red", "gray"];

const ranking = scorecard.ranking_by_mean_step_cv;

const cards = ranking
  .map((r, i) => {
    const key = r.key;
    const sys = scorecard.systems[key];
    const c = CARDS[key];
    const scaleBlocks = STRIP_SCALES.map((sc) => {
      const scale = sys.scales[sc];
      const stats = `even-step score (CV) ${scale.step_cv_pct.toFixed(1)}% · biggest/smallest step ${scale.step_max_min_ratio.toFixed(1)}× · hue drift ${scale.hue_drift_deg == null ? "0° (fully neutral)" : scale.hue_drift_deg.toFixed(1) + "°"}`;
      return `<div class="scale-block">
        <div class="scale-label"><span class="scale-name">${esc(sc)}</span><span class="scale-stats">${esc(stats)}</span></div>
        ${colorStripSVG(`${sys.system} ${sc} (as shipped)`, hexes(key, sc), names(key, sc))}
        ${colorStripSVG(`${sys.system} ${sc} lightness skeleton`, graySkeleton(key, sc), names(key, sc), 12)}
        ${gapRowSVG(`${sys.system} ${sc}`, hexes(key, sc), null, scale.step_distances)}
      </div>`;
    }).join("\n");
    const notes = c.notes
      .map((n) => `<li>${esc(n.say)}${n.num ? ` <span class="note-num">${esc(n.num)}</span>` : ""}</li>`)
      .join("\n");
    const caveat = c.caveat ? `<p class="caveat">${esc(c.caveat)}</p>` : "";
    return `<article class="card" id="${key}">
      <header class="card-head">
        <span class="rank-badge" aria-label="Rank ${i + 1} of 6">${i + 1}</span>
        <div class="card-title">
          <h3>${esc(sys.system)}</h3>
          <p class="tagline">${esc(c.verdict)}</p>
          <p class="source">${esc(sys.source)}</p>
        </div>
      </header>
      ${caveat}
      <div class="scales">${scaleBlocks}</div>
      <p class="bars-note">Three views per scale: the shipped colors · the same steps as neutral grays at their measured lightness (the darkness skeleton) · the swatches re-spaced so each gap equals the measured perceptual distance between neighbors. Even gaps = even scale. Gap budgets are per-row; the stats line carries the absolute numbers.</p>
      <ul class="findings">${notes}</ul>
    </article>`;
  })
  .join("\n");

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
<meta name="description" content="We measured the color systems everyone copies — Tailwind, Material, Bootstrap, Primer, Radix, Chakra — and turned the findings into visual proof a designer can feel. Reproducible.">
<style>
:root{
  --bg:${PALETTE.bg}; --card:${PALETTE.card}; --line:#2a2a31;
  --text:${PALETTE.text}; --muted:${PALETTE.muted}; --accent:${PALETTE.accent}; --gold:${PALETTE.gold};
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
.howto p{font-size:clamp(18px,2.4vw,24px);max-width:44ch;font-weight:500}
.howto p + p{margin-top:18px}

/* proof blocks */
.proof{padding:120px 0}
.proof-kicker{display:block;color:var(--gold);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:13px;margin-bottom:18px}
.praise .proof-kicker{color:#7fdc9a}
.proof-head{font-size:clamp(38px,6.5vw,80px);line-height:1.02;letter-spacing:-.035em;font-weight:800;margin-bottom:22px;max-width:18ch}
.proof-deck{font-size:clamp(17px,2.2vw,22px);color:var(--muted);max-width:58ch;margin-bottom:44px}
.proof-deck em{color:var(--text);font-style:normal;font-weight:600}
.proof-visual{margin:0 0 26px}
.proof-visual svg{display:block}
.proof-visual svg + svg{margin-top:36px}
.strip-lede{margin:40px 0 12px;color:var(--muted);font-size:15px}
.receipt{margin-top:30px}
.receipt svg{display:block}
.bleed{width:100vw;margin-left:calc(50% - 50vw)}
.bleed svg{display:block}
.stacked-strips svg + svg{margin-top:8px}
.proof-caption{font-size:clamp(17px,2.2vw,21px);max-width:62ch;font-weight:500}
.proof-caption code{font-size:.85em}
.proof-small{margin-top:16px;color:var(--muted);font-size:13.5px;max-width:78ch;font-variant-numeric:tabular-nums}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:32px;margin-top:36px}
.card-head{display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap}
.rank-badge{font-size:72px;font-weight:800;line-height:.9;color:var(--gold);min-width:56px;font-variant-numeric:tabular-nums}
.card-title{flex:1 1 320px}
.card-title h3{font-size:clamp(24px,3vw,34px);letter-spacing:-.02em}
.tagline{color:var(--text);font-weight:600;margin-top:4px;font-size:18px}
.source{color:var(--muted);font-size:13px;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.caveat{margin-top:20px;padding:14px 16px;border:1px solid var(--gold);border-radius:8px;color:var(--text);font-size:15px}
.scales{margin-top:26px;display:grid;gap:30px}
.scale-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.scale-name{font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:13px}
.scale-stats{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.scale-block svg{display:block}
.scale-block svg + svg{margin-top:6px}
.bars-note{color:var(--muted);font-size:13px;margin-top:14px;max-width:90ch}
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
  <p>Every swatch here is the real, untouched color from each system's published package.</p>
  <p>We measured how different neighboring shades actually <em>look</em> — not how different their names sound — and turned the results into pictures you can judge with your own eyes.</p>
  <p>Headlines say what breaks; the small print underneath carries the numbers, and the full table waits at the <a href="#numbers">bottom</a>.</p>
</section>

${proofBlocks.join("\n")}

<section id="systems">
  <h2>The report cards</h2>
${cards}
</section>

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
  <p class="table-note">Ranked by mean step-distance CV across each system's blue, red, green and gray scales — lower means more even steps. Two results hold everywhere: all 24 scales are strictly monotone in GenSpace lightness (zero reversals across ${TOTAL_STEPS} steps), and no system's mid shade is a contrast dead zone. Radix's position comes with a design-intent caveat — see Finding 11 and its card.</p>
</section>

<section id="methodology" class="method">
  <h2>Methodology</h2>
  <p>Every hex token is mapped into <strong>helmlab GenSpace</strong> (<code>hl.genFromHex(hex)</code> → [L, a, b] with L in 0–1; <code>hl.genToLch</code> → [L, C, h°]), a perceptually uniform generation space. Four measurements per scale, plus two visual-proof constructions:</p>

  <h4>1 · Step-distance consistency (step CV)</h4>
  <div class="formula">d_i = GenSpace Euclidean distance(token_i, token_{i+1})
step CV = std(d) / mean(d) × 100        (plus max/min ratio)</div>
  <p>Lower CV = more even perceptual steps. The proportional-gap rows draw these distances directly: the gap between two swatches is proportional to d_i within that row.</p>

  <h4>2 · Lightness uniformity (L-CV) and monotonicity</h4>
  <div class="formula">dL_i = L_{i+1} − L_i
L-CV = std(dL) / |mean(dL)| × 100      (any sign flip → monotonicity violation)</div>

  <h4>3 · Hue drift</h4>
  <div class="formula">drift = max_i |h_i − h_first|   with 360° wrap,
skipping steps with C &lt; 0.03 as achromatic</div>

  <h4>4 · Contrast</h4>
  <div class="formula">WCAG contrastRatio(mid, #ffffff) and contrastRatio(mid, #000000)
flag if both &lt; 4.5   (mid = 500, Radix step 9, Primer step 5)</div>

  <h4>5 · The hue-proof swatches (Findings 02 &amp; 08)</h4>
  <div class="formula">h_start = hue of first non-achromatic step,  h_end = hue at the worst-drift step
swatch  = hl.genFromLch([0.6, 0.2, h]) → hex     (identical L and C for both;
C reduced jointly if either hue falls outside sRGB at C = 0.2)</div>
  <p>Because both swatches share the same GenSpace lightness and chroma, any visible difference between them is hue drift and nothing else. Both pairs shown on this page are in-gamut at C = 0.2.</p>

  <h4>6 · The lightness skeleton (Finding 07 and every report card)</h4>
  <div class="formula">gray_i = hl.genFromLch([L_i, 0, 0]) → hex    (L_i = the token's measured GenSpace L)</div>
  <p>Rendering each token as a neutral gray at its measured lightness strips hue and chroma away, leaving only the darkness ladder — uneven lightness becomes visible without a chart.</p>

  <h4>7 · The near-duplicate honesty gate (Finding 04)</h4>
  <div class="formula">spot-the-boundary / seamless side-by-side visual  ⇒  hl.difference(pair) &lt; ${JND_GATE}
otherwise the BUILD FAILS</div>
  <p>Visual proof patterns are type-checked against the claim they make: a visual that invites you to struggle to see a difference ("spot the boundary") is only honest if the measured difference is genuinely sub-threshold — being a ramp's <em>smallest</em> step does not make a pair perceptually <em>small</em>. Exactly one pair in this audit qualifies: Primer gray 4→5 (trained difference ${fmt(CTX.primerGrayPairDiff, 3)}). The audit's smallest chromatic step, Material blue 400→500, measures ${fmt(CTX.matPairDiff, 3)} on a metric that saturates near ${fmt(CTX.bwDiff, 2)} — clearly visible — so the build asserts it is <em>rejected</em> by the gate and shows it only as a relative-scale receipt inside its ramp's gap row.</p>

  <h4>Provenance &amp; limitations</h4>
  <ul>
    <li>Token sources are the official npm packages, versions recorded in <code>data/tokens/*.json</code>. Tailwind v4 publishes <code>oklch()</code>, converted to sRGB hex via culori; Bootstrap's chromatic ramps are generated exactly per its own <code>tint-color</code>/<code>shade-color</code> (sass <code>mix()</code>) definitions.</li>
    <li>This audit measures <strong>scale quality only</strong> — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about overall design quality, aesthetics, component design, or the fitness of these palettes for their intended workflows.</li>
    <li><strong>Radix Colors is role-based by design</strong>: its 12 steps are documented use-case roles, not an even ramp, so uniformity metrics measure a contract it never signed. See Finding 11 and its card.</li>
    <li>Results depend on the choice of perceptual space; GenSpace correlates strongly with OKLab-class spaces, so orderings should be broadly stable, but exact numbers are space-specific.</li>
    <li>This page checks itself twice at build time: every text/background pair in the design is verified against WCAG (body text ≥ 7:1 AAA, secondary text ≥ 4.5:1 AA) using helmlab's <code>contrastRatio</code>, and every near-duplicate visual is verified against the honesty gate above — the build fails otherwise.</li>
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
