#!/usr/bin/env node
// The Open-Source Color Audit — static site generator.
// Reads data/scorecard.json + data/tokens/*.json and emits index.html.
// No dependencies. Run: node build.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const scorecard = JSON.parse(readFileSync(join(ROOT, "data/scorecard.json"), "utf8"));
const tokens = {};
for (const key of Object.keys(scorecard.systems)) {
  tokens[key] = JSON.parse(readFileSync(join(ROOT, `data/tokens/${key}.json`), "utf8"));
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// Editorial copy (findings distilled from results/REPORT.md — same numbers)
// ---------------------------------------------------------------------------

const FINDINGS = {
  chakra: {
    tagline: "Most balanced overall",
    notes: [
      "Wins the ranking not with a star scale but with no weak one: red (step CV 26.0%), green (29.2%) and blue (43.1%) are all mid-pack or better, and its chromatic lightness ladders (L-CV 18.2–19.0%) are the most consistent trio in the audit.",
      "Blue drifts 20.5° by step 900 — #1a365d turns noticeably indigo relative to 50. Gray-900 also picks up 19.1° of blue cast, a deliberate cool-gray choice but the largest gray drift measured.",
      "Gray shows the usual light-end crowding: 100→200 is a 0.020 step while 500→600 is 0.227 — an 11.2× spread inside one ramp.",
    ],
  },
  primer: {
    tagline: "Best chromatic ramps; neutral is two scales in one",
    notes: [
      "Primer red is the single most even chromatic scale in the audit: step CV 16.9%, max/min ratio only 1.8×. Blue and green (31.6% / 31.1%) with L-CVs of 19–22% are the tightest 10-step chromatic set measured.",
      "All three chromatic mid shades (blue #0969da, red #cf222e, green #1a7f37) clear WCAG AA against white — the only system where every chromatic mid supports white text. Clearly engineered.",
      "The 14-step neutral behaves like two scales glued together: steps 4→5 differ by just 0.011 while 7→8 jumps 0.206 (18.6× spread). Blue also drifts 27.6° by its darkest step — the largest hue drift in the audit.",
    ],
  },
  bootstrap: {
    tagline: "Mechanical ramps, surprisingly disciplined lightness",
    notes: [
      "The tint/shade mix() construction yields the lowest mean L-CV of any system (24.1%). Green is the audit's best single scale on lightness: L-CV 7.5%, step CV 14.8%, max/min 1.47×.",
      "Hue is near-immovable: blue drifts only 2.9° across nine steps — a free benefit of mixing with pure white and black.",
      "The cost shows at the light end of blue: 100→200 is a 0.303 jump while 400→500 is 0.038, an 8.0× imbalance inside one ramp — equal RGB mixing is not equal perceptual spacing.",
    ],
  },
  tailwind: {
    tagline: "Hue-true, but 500 sits close to 600",
    notes: [
      "Hue handling is strong for an 11-step system: worst drift 13.2° (red), blue only 9.6°, gray 6.9° — consistent with the v4 oklch redesign.",
      "Blue 500→600 is only 0.045 while 200→300 is 0.219 (4.9×): the two most-used button shades are perceptually the closest pair in the ramp. Red shows the same pattern, plus a 0.318 cliff at 900→950.",
      "Gray max/min is 22.1×: 50→100 is nearly imperceptible (0.009) while 400→500 spans 0.203. Mid-500s are tuned dark-first: green-500 reads 9.47 against black but only 2.22 against white.",
    ],
  },
  material: {
    tagline: "Its age shows at the ramp ends",
    notes: [
      "Blue 400→500 is just 0.026 — #42a5f5 and #2196f3 are near-duplicates — while 50→100 spans 0.162: a 6.2× spread and the worst chromatic step consistency measured (CV 68.9%).",
      "Red drifts 20.8° by step 500 and its L-CV (65.5%) is the worst chromatic lightness ladder in the audit; 700→800 nearly stalls at 0.035.",
      "Credit where due: green is clean (step CV 31.8%, hue drift 3.6°), and gray's neutrality is perfect — every step registers achromatic in GenSpace.",
    ],
  },
  radix: {
    tagline: "Uneven by explicit design",
    notes: [
      "Raw numbers are the audit's highest (mean step CV 101.6%, gray max/min 73.9×) — but Radix documents its 12 steps as use-case roles (1–2 backgrounds, 3–5 component states, 9 solid, 11–12 text), not an even ramp. The big 11→12 text jumps (red: 0.435, the largest single step in the audit) are intentional.",
      "Re-scored on interior steps 2–11 only, blue and green become respectable (step CV 30.8% / 37.3%); red stays uneven (64.6%) and gray remains at 97.6% even without the role endpoints.",
      "Within its own logic it is consistent: solid step 9 always lands mid-contrast and lightness never reverses. Judged as a perceptual ramp it ranks last; judged as a role system it is coherent — weigh which contract you need.",
    ],
    caveat:
      "Caveat: Radix is role-based by design. Its documentation assigns each of the 12 steps a UI role rather than promising even perceptual spacing, so step-uniformity metrics measure a contract Radix never signed. The rank below is only meaningful if you need an even ramp.",
  },
};

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

const STRIP_SCALES = ["blue", "red", "gray"]; // scales rendered per card
const GLOBAL_MAX_STEP = Math.max(
  ...Object.values(scorecard.systems).flatMap((sys) =>
    STRIP_SCALES.flatMap((sc) => sys.scales[sc]?.step_distances ?? [])
  )
);

function colorStripSVG(systemName, scaleName, hexByStep) {
  const steps = Object.keys(hexByStep);
  const n = steps.length;
  const W = 640, H = 34, gap = 3;
  const w = (W - gap * (n - 1)) / n;
  let rects = "";
  steps.forEach((step, i) => {
    const hex = hexByStep[step];
    const x = (i * (W - gap * (n - 1))) / n + i * gap;
    rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${H}" fill="${hex}"><title>${esc(
      `${systemName} ${scaleName} ${step}: ${hex}`
    )}</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(
    `${systemName} ${scaleName} scale, ${n} steps`
  )}" preserveAspectRatio="none">${rects}</svg>`;
}

function stepBarsSVG(systemName, scaleName, scale, hexByStep) {
  const steps = Object.keys(hexByStep);
  const d = scale.step_distances;
  const n = d.length;
  const W = 640, H = 72, gap = 3;
  // bar i sits between token i and i+1 -> center it under the boundary
  const slot = (W - gap * (steps.length - 1)) / steps.length;
  let bars = "";
  d.forEach((di, i) => {
    const h = Math.max(2, (di / GLOBAL_MAX_STEP) * (H - 4));
    const cx = (i + 1) * slot + i * gap + gap / 2; // boundary between token i and i+1
    const bw = Math.min(slot * 0.8, 26);
    const x = cx - bw / 2;
    bars += `<rect x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(
      2
    )}" fill="#8fa7c4"><title>${esc(
      `${systemName} ${scaleName} step ${steps[i]}→${steps[i + 1]}: d = ${di.toFixed(4)}`
    )}</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(
    `${systemName} ${scaleName}: perceptual step sizes between adjacent tokens (GenSpace distance). Even bars = even scale.`
  )}" preserveAspectRatio="none"><line x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" stroke="#2a2a31" stroke-width="1"/>${bars}</svg>`;
}

function hueArcSVG(systemName, driftDeg, driftScale) {
  const R = 15, C = 20;
  const label =
    driftDeg == null
      ? `${systemName}: gray fully achromatic, no hue to drift`
      : `${systemName}: worst hue drift ${driftDeg}° (${driftScale})`;
  let arc = "";
  if (driftDeg != null) {
    const a = (Math.min(driftDeg, 359) * Math.PI) / 180;
    const x = C + R * Math.sin(a);
    const y = C - R * Math.cos(a);
    const large = driftDeg > 180 ? 1 : 0;
    arc = `<path d="M ${C} ${C - R} A ${R} ${R} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(
      2
    )}" fill="none" stroke="#ffd166" stroke-width="4" stroke-linecap="butt"/>`;
  }
  return `<svg viewBox="0 0 40 40" width="40" height="40" role="img" aria-label="${esc(label)}"><title>${esc(
    label
  )}</title><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#2a2a31" stroke-width="4"/>${arc}</svg>`;
}

// ---------------------------------------------------------------------------
// Sections
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

const cards = ranking
  .map((r, i) => {
    const key = r.key;
    const sys = scorecard.systems[key];
    const tok = tokens[key];
    const f = FINDINGS[key];
    const scaleBlocks = STRIP_SCALES.map((sc) => {
      const scale = sys.scales[sc];
      const hexByStep = tok.scales[sc];
      const stats = `step CV ${scale.step_cv_pct.toFixed(1)}% · max/min ${scale.step_max_min_ratio.toFixed(
        1
      )}× · hue drift ${scale.hue_drift_deg == null ? "— (achromatic)" : scale.hue_drift_deg.toFixed(1) + "°"}`;
      return `<div class="scale-block">
        <div class="scale-label"><span class="scale-name">${esc(sc)}</span><span class="scale-stats">${esc(stats)}</span></div>
        ${colorStripSVG(sys.system, sc, hexByStep)}
        ${stepBarsSVG(sys.system, sc, scale, hexByStep)}
      </div>`;
    }).join("\n");
    const notes = f.notes.map((n) => `<li>${esc(n)}</li>`).join("\n");
    const caveat = f.caveat ? `<p class="caveat">${esc(f.caveat)}</p>` : "";
    return `<article class="card" id="${key}">
      <header class="card-head">
        <span class="rank-badge" aria-label="Rank ${i + 1} of 6">${i + 1}</span>
        <div class="card-title">
          <h3>${esc(sys.system)}</h3>
          <p class="tagline">${esc(f.tagline)}</p>
          <p class="source">${esc(sys.source)}</p>
        </div>
        <div class="hue-indicator">
          ${hueArcSVG(sys.system, r.worst_hue_drift_deg, worstDriftScale(sys))}
          <span class="hue-num">${r.worst_hue_drift_deg.toFixed(1)}°<small>worst hue drift</small></span>
        </div>
      </header>
      ${caveat}
      <div class="scales">${scaleBlocks}</div>
      <p class="bars-note">Bars: perceptual distance between adjacent tokens (helmlab GenSpace). Even bars = even scale. All bars share one absolute vertical scale across every system.</p>
      <ul class="findings">${notes}</ul>
    </article>`;
  })
  .join("\n");

function worstDriftScale(sys) {
  let best = null, bestV = -1;
  for (const [name, sc] of Object.entries(sys.scales)) {
    if (sc.hue_drift_deg != null && sc.hue_drift_deg > bestV) {
      bestV = sc.hue_drift_deg;
      best = name;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Open-Source Color Audit</title>
<meta name="description" content="Measuring the color scales of popular open-source design systems — perceptual step uniformity, hue drift, contrast. Reproducible.">
<style>
:root{
  --bg:#0b0b0d; --card:#121216; --line:#2a2a31;
  --text:#ececf1; --muted:#a8a8b3; --accent:#8fc1ff; --gold:#ffd166; --bar:#8fa7c4;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
main{max-width:1100px;margin:0 auto;padding:0 24px}
a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
a:hover{color:#c4defc}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;background:#1a1a20;border:1px solid var(--line);border-radius:4px;padding:1px 6px}
h2{font-size:clamp(26px,4vw,40px);letter-spacing:-.02em;margin-bottom:16px}
section{padding:72px 0;border-top:1px solid var(--line)}

/* hero */
.hero{padding:110px 0 90px;border-top:none}
.hero h1{font-size:clamp(46px,9vw,108px);line-height:.98;letter-spacing:-.035em;font-weight:800}
.hero .thesis{font-size:clamp(20px,3vw,30px);margin-top:28px;max-width:22ch;font-weight:600;color:var(--text)}
.hero .method-line{margin-top:22px;color:var(--muted);max-width:62ch}
.kicker{display:block;color:var(--gold);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:14px;margin-bottom:22px}

/* leaderboard */
table{width:100%;border-collapse:collapse;margin-top:12px}
th{ text-align:left;color:var(--muted);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.08em;padding:10px 12px;border-bottom:1px solid var(--line)}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
td{padding:14px 12px;border-bottom:1px solid var(--line);font-size:17px}
.rank-cell{font-size:34px;font-weight:800;color:var(--gold);width:64px;line-height:1;font-variant-numeric:tabular-nums}
.sys-cell{font-weight:700}
.table-note{color:var(--muted);font-size:14px;margin-top:14px;max-width:75ch}

/* cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:32px;margin-top:36px}
.card-head{display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap}
.rank-badge{font-size:72px;font-weight:800;line-height:.9;color:var(--gold);min-width:56px;font-variant-numeric:tabular-nums}
.card-title{flex:1 1 320px}
.card-title h3{font-size:clamp(24px,3vw,34px);letter-spacing:-.02em}
.tagline{color:var(--text);font-weight:600;margin-top:4px}
.source{color:var(--muted);font-size:13px;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.hue-indicator{display:flex;align-items:center;gap:12px}
.hue-num{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.hue-num small{display:block;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.caveat{margin-top:20px;padding:14px 16px;border:1px solid var(--gold);border-radius:8px;color:var(--text);font-size:15px}
.scales{margin-top:26px;display:grid;gap:26px}
.scale-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.scale-name{font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:13px}
.scale-stats{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.scale-block svg{display:block}
.scale-block svg + svg{margin-top:6px}
.bars-note{color:var(--muted);font-size:13px;margin-top:14px}
.findings{margin-top:18px;padding-left:22px;display:grid;gap:10px}
.findings li{font-size:16px}

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
  <h1>We measured the color scales everyone copies.</h1>
  <p class="thesis">Six design systems. 24 scales. 252 tokens. One perceptual ruler.</p>
  <p class="method-line">Every hex token from Tailwind, Primer, Material, Bootstrap, Radix and Chakra was mapped into helmlab GenSpace and scored on step uniformity, lightness monotonicity, hue drift and WCAG contrast — measured, not guessed. <a href="#methodology">Read the methodology</a>.</p>
</header>

<section id="leaderboard">
  <h2>Leaderboard</h2>
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
  <p class="table-note">Ranked by mean step-distance CV across each system's blue, red, green and gray scales — lower means more even steps. Two results hold everywhere: all 24 scales are strictly monotone in GenSpace lightness (zero reversals across 228 steps), and no system's mid shade is a contrast dead zone. Radix's position comes with a design-intent caveat — see its card.</p>
</section>

<section id="systems">
  <h2>The six systems</h2>
${cards}
</section>

<section id="methodology" class="method">
  <h2>Methodology</h2>
  <p>Every hex token is mapped into <strong>helmlab GenSpace</strong> (<code>hl.genFromHex(hex)</code> → [L, a, b] with L in 0–1; <code>hl.genToLch</code> → [L, C, h°]), a perceptually uniform generation space. Four measurements per scale:</p>

  <h4>1 · Step-distance consistency (step CV)</h4>
  <div class="formula">d_i = GenSpace Euclidean distance(token_i, token_{i+1})
step CV = std(d) / mean(d) × 100        (plus max/min ratio)</div>
  <p>Lower CV = more even perceptual steps. This is what the bar charts on each card show.</p>

  <h4>2 · Lightness uniformity (L-CV) and monotonicity</h4>
  <div class="formula">dL_i = L_{i+1} − L_i
L-CV = std(dL) / |mean(dL)| × 100      (any sign flip → monotonicity violation)</div>

  <h4>3 · Hue drift</h4>
  <div class="formula">drift = max_i |h_i − h_first|   with 360° wrap,
skipping steps with C &lt; 0.03 as achromatic</div>

  <h4>4 · Contrast</h4>
  <div class="formula">WCAG contrastRatio(mid, #ffffff) and contrastRatio(mid, #000000)
flag if both &lt; 4.5   (mid = 500, Radix step 9, Primer step 5)</div>

  <h4>Provenance &amp; limitations</h4>
  <ul>
    <li>Token sources are the official npm packages, versions recorded in <code>data/tokens/*.json</code>. Tailwind v4 publishes <code>oklch()</code>, converted to sRGB hex via culori; Bootstrap's chromatic ramps are generated exactly per its own <code>tint-color</code>/<code>shade-color</code> (sass <code>mix()</code>) definitions.</li>
    <li>This audit measures <strong>scale quality only</strong> — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about overall design quality, aesthetics, component design, or the fitness of these palettes for their intended workflows.</li>
    <li><strong>Radix Colors is role-based by design</strong>: its 12 steps are documented use-case roles, not an even ramp, so uniformity metrics measure a contract it never signed. This caveat is repeated on its card.</li>
    <li>Results depend on the choice of perceptual space; GenSpace correlates strongly with OKLab-class spaces, so orderings should be broadly stable, but exact numbers are space-specific.</li>
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
    <p style="color:var(--muted);font-size:13px;margin-top:24px">Rebuild with <code>node build.mjs</code> — the page is generated from <code>data/scorecard.json</code> and <code>data/tokens/*.json</code>. MIT © 2026 Görkem Yıldız.</p>
  </div>
</footer>
</body>
</html>
`;

writeFileSync(join(ROOT, "index.html"), html);
console.log(`Wrote index.html (${(html.length / 1024).toFixed(1)} KB)`);
