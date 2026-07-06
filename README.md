# The Open-Source Color Audit

**You call it blue-500. Is it?** We measured the color systems everyone copies — Tailwind CSS v4, GitHub Primer, Material Design, Bootstrap 5, Radix Colors, Chakra UI (24 scales, 252 tokens) — and turned the findings into visual proof a designer can feel, not just a table of statistics.

**Live site: https://grkmyldz148.github.io/color-audit/**

Every swatch on the site is the real, untouched color from each system's published package, mapped into helmlab's perceptually uniform GenSpace. Headlines say what breaks when you ship UI with these tokens; the numbers sit in the small print; the full table waits at the bottom.

## What we found (in plain language)

1. **Two tokens. Basically one color.** Material's blue 400 (`#42a5f5`) and blue 500 (`#2196f3`) — your button and its hover state — are perceptually near-duplicates (distance 0.026, the smallest chromatic step measured). The jump from 50 to 100 in the same ramp is 6× bigger.
2. **One step whispers, another shouts.** In Bootstrap's blue, the 100→200 jump is **8×** the 400→500 jump. The token names promise even stairs; what ships is one cliff and three near-flat steps — because equal RGB mixing is not equal seeing.
3. **You call it blue. The dark end disagrees.** Primer's blue drifts **27.6° of hue** between its lightest and darkest steps — the light end leans cyan, the dark end leans violet. The site proves it by re-rendering both hues at *identical* lightness and colorfulness, so the only thing your eye can see differ is hue.
4. **Tailwind's most-used pair is its closest pair.** Blue 500→600 (the classic button + hover) is the smallest jump in the ramp — 4.9× smaller than 200→300.
5. **One gray scale. Except it's two.** Primer's 14-step neutral is seven near-identical light grays, a cliff (7→8 is **19×** the 4→5 jump), then a normal dark ramp.
6. **Material red stops getting darker halfway down.** Rendered as a grayscale "lightness skeleton," steps 500–900 barely move (L-CV 65.5%, the most uneven chromatic darkness ladder measured).
7. **Credit: Tailwind's blue never stops being blue.** Worst-case hue drift 9.6° — the equal-lightness proof swatches are nearly indistinguishable. The v4 perceptual redesign pays off.
8. **Credit: Primer red is the most even ramp we measured.** Step CV 16.9%, biggest/smallest step only 1.8× — and all three Primer mids hold white text (the only system where that's true).
9. **Nobody shipped a dead zone.** Every system's mid shade holds ≥ 4.5:1 contrast against white or black, and all 24 scales are strictly monotone in lightness — zero reversals across 228 steps.
10. **Radix comes last — because the ranking is the wrong lens for it.** Its 12 steps are documented UI *jobs* (backgrounds, component states, solid, text), not an even ramp; the giant 11→12 jump (0.435, the audit's largest step) is deliberate text-vs-surface contrast. Judged as a role system it is coherent. We show it for completeness.

## The numbers, if you want them

Ranked by mean step-distance CV (lower = more even steps):

| # | System | Mean step CV % | Mean L-CV % | Worst hue drift | Monotonicity violations | Mid fails AA both ways |
|---|--------|---------------:|------------:|----------------:|------------------------:|-----------------------:|
| 1 | **Chakra UI** | 41.6 | 28.2 | 20.5° (blue) | 0 | 0 |
| 2 | **GitHub Primer** | 44.2 | 41.4 | 27.6° (blue) | 0 | 0 |
| 3 | **Bootstrap 5** | 44.6 | 24.1 | 11.9° (red) | 0 | 0 |
| 4 | **Tailwind CSS v4** | 45.6 | 43.1 | 13.2° (red) | 0 | 0 |
| 5 | **Material Design (2014)** | 56.6 | 42.9 | 20.8° (red) | 0 | 0 |
| 6 | **Radix Colors** | 101.6 | 95.9 | 17.2° (blue) | 0 | 0 |

> **Radix caveat:** role-based by design — see finding 10. Re-scored on interior steps 2–11 its blue and green become ordinary (step CV 30.8% / 37.3%); red and gray stay uneven either way.

## Methodology (short version)

Every hex token → helmlab GenSpace (`hl.genFromHex` → `[L, a, b]`, `hl.genToLch` → `[L, C, h°]`). Per scale:

- **Step evenness:** `d_i` = GenSpace distance between adjacent tokens; step CV = std/mean × 100 (plus max/min ratio). The site draws these distances directly: gaps between swatches are proportional to `d_i`.
- **Lightness ladder:** L-CV over `dL_i`; any sign flip = monotonicity violation.
- **Hue drift:** max |h_i − h_first| (360° wrap), skipping achromatic steps (C < 0.03).
- **Contrast:** WCAG ratio of each mid shade vs white and black; flag if both < 4.5.
- **Hue-proof swatches:** first-step hue vs worst-drift hue, both re-rendered at identical L = 0.6, C = 0.2 via `genFromLch` — any visible difference is hue alone (C reduced jointly if out of sRGB gamut; both published pairs are in-gamut at 0.2).
- **Lightness skeleton:** each token re-rendered as neutral gray at its measured L via `genFromLch([L, 0, 0])` — the darkness ladder with hue stripped away.

The page also checks itself: at build time every text/background pair in the design is verified against WCAG (body AAA 7:1, secondary AA 4.5:1) and the build fails otherwise.

## Reproduce it

```bash
git clone https://github.com/Grkmyldz148/color-audit
cd color-audit
npm install        # single dependency: helmlab (build-time only)
node build.mjs     # regenerates index.html from data/
```

- `data/tokens/*.json` — the raw hex tokens with npm package + version provenance
- `data/scorecard.json` — every measurement on the site
- `build.mjs` — the single source: derives all page numbers from the data (and fact-checks the "largest step" claim at build time); the emitted page is static HTML + inline SVG, no JavaScript

**Limitations:** this audit measures *scale quality only* — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about aesthetics, component design, or fitness for each system's intended workflow. Exact numbers are GenSpace-specific (orderings should be broadly stable across OKLab-class spaces).

---

Produced with the **color-skills** agent skills + the **helmlab** library.

```
npx skills add Grkmyldz148/color-skills
```

[helmlab.space/benchmark](https://helmlab.space/benchmark) · MIT © 2026 Görkem Yıldız
