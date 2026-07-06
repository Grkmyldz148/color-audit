# The Open-Source Color Audit

**You call it blue-500. Is it?** We measured the color systems everyone copies — Tailwind CSS v4, GitHub Primer, Material Design, Bootstrap 5, Radix Colors, Chakra UI (24 scales, 252 tokens) — and turned the findings into visual proof a designer can feel, organized as **four chapters**, each a different question a designer actually asks.

**Live site: https://grkmyldz148.github.io/color-audit/**

Every swatch on the site is the real, untouched color from each system's published package, mapped into helmlab's perceptually uniform GenSpace. Headlines say what breaks when you ship UI with these tokens; the numbers sit in the small print; the full table waits at the bottom.

## Chapter 1 — Steps: does "+1" always mean one visual step?

- **One step whispers, another shouts (Bootstrap).** The blue 100→200 jump is **8×** the 400→500 jump. Token names promise even stairs; what ships is one cliff and three near-flat steps — equal RGB mixing is not equal seeing. The site draws it directly: gaps between swatches are proportional to the measured distances.
- **One gray scale, except it's two (Primer).** The 14-step neutral is seven whisper-quiet light grays, a cliff (7→8 is **19×** the 4→5 jump), then a normal dark ramp. Gray 4→5 is the audit's one genuine near-duplicate (trained difference 0.019, under the build's 0.025 gate) and the *only* pair shown as a seamless spot-the-boundary strip — every other "closest pair" is plainly visible butted together.
- **The smallest steps hide on the button hover (Material & Tailwind).** Material blue 400→500 is the audit's smallest chromatic step (0.026, asserted at build time), 6× less change than the same ramp spends on 50→100; Tailwind's 500→600 — the classic button + hover — is the closest pair in its ramp (4.9× smaller than 200→300). Shown as receipt chips, in relative terms only: both pairs are visibly different; the finding is *where* each ramp put its least contrast.

## Chapter 2 — Hue: is your blue still blue? Is your gray even gray?

- **You call it blue; the dark end disagrees (Primer vs Tailwind).** Primer's blue drifts **27.6° of hue** top to bottom (cyan → violet); Tailwind's drifts 9.6° on the identical test — the v4 perceptual redesign paying off. Proved by re-rendering both hues at *identical* lightness and colorfulness, so the only visible difference is hue.
- **Your gray isn't gray (NEW).** We measured the chroma of every gray token in all six systems. Material and Radix ship ink-true neutrals (C = 0.000 at every step). The rest lean cool: Tailwind gray-900 (C 0.063) and Chakra gray-500 (C 0.063) are in a dead heat for the most tinted "gray" in the audit — more than twice the audit's 0.03 neutrality cutoff — with Primer gray-8 (C 0.038) behind; Bootstrap's faint lean (C 0.027) stays under the cutoff. Not one gray token in the audit leans warm. Each system's most-tinted gray is shown next to a true neutral rebuilt at the same lightness (`genFromLch([L, 0, 0])`) — for Material and Radix the two chips are literally identical.
- **There is no such thing as blue-500 (NEW).** The six systems' blue-500-equivalents side by side: hue spans 254.2°–262.6° (8.4°), lightness spans 0.464–0.599 — Material's mid blue is 29% lighter than Primer's — and white-text contrast ranges 3.12:1 to 5.19:1. Same token name, six visibly different colors (every pairwise difference asserted above the near-duplicate threshold).

## Chapter 3 — Weight: do same-numbered tokens carry the same weight?

- **Tokens with the same name don't carry the same visual weight (NEW).** Within each system we compared the measured lightness of blue/red/green/gray at the same step. Only Radix truly delivers "same step, same weight" (mid-row L spread 0.028 — asserted tightest); Chakra is close (0.045). Tailwind's green-500 floats 0.21 L above its own gray-500; Bootstrap's row spreads 0.254; Primer's "gray 5" sits at L 0.89 — not a mid-tone at all, a souvenir of the glued scale.
- **White text passes on one 500 and fails on another (NEW).** Computed `contrastRatio('#ffffff', shade)` for every mid token: inside Tailwind alone, white text **passes on gray-500 at 4.84:1 and fails on green-500 at 2.22:1**. Across systems, white text that clears AA on Primer's blue (5.19:1) fails on Material's blue-500 (3.12:1). Bootstrap's color mids scrape past (4.50–4.53:1, blue by a margin of 0.0008) while its gray fails at 2.07:1; Material's and Radix's mid rows hold white text nowhere. Every pass/fail badge is asserted at build time.

## Chapter 4 — What to steal: each system's best measured trait

| System | Steal this | The number |
|---|---|---|
| **Bootstrap 5** | Lightness discipline | best mean L-CV (24.1%); green is the evenest darkness ladder of all 24 scales (L-CV 7.5%, asserted) |
| **Tailwind v4** | The hue lock | no scale drifts > 13.2°; blue holds 9.6° across 11 steps — a third of Primer's |
| **GitHub Primer** | Red's even steps | step CV 16.9%, max/min 1.8× — the most even hand-built ramp (only machine-mixed Bootstrap green is tighter; asserted) |
| **Chakra UI** | Balance | tightest chromatic trio (L-CVs 18.2–19.0%, asserted) + second-most-uniform mid-row weight (0.045 L) |
| **Material** | The ink-true gray | C = 0.0000 at all ten gray steps — shipped strip and lightness skeleton are identical |
| **Radix Colors** | Role clarity | 12 steps are documented UI jobs, not a ramp — and its four step-9 solids sit within 0.028 L (the audit's only true "same name, same weight" row) |

Each card also carries an honest "what not to copy along with it" note. The chapter closes on the floor everyone clears: **nobody shipped a dead zone** — every mid shade holds ≥ 4.5:1 against white or black, and all 24 scales are strictly monotone in lightness (zero reversals across 228 steps).

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

> **Radix caveat:** role-based by design — see its Chapter 4 card. Re-scored on interior steps 2–11 its blue and green become ordinary (step CV 30.8% / 37.3%); red and gray stay uneven either way.

## Methodology (short version)

Every hex token → helmlab GenSpace (`hl.genFromHex` → `[L, a, b]`, `hl.genToLch` → `[L, C, h°]`). Per scale:

- **Step evenness (Ch. 1):** `d_i` = GenSpace distance between adjacent tokens; step CV = std/mean × 100 (plus max/min ratio). The site draws these distances directly as proportional gaps.
- **Lightness ladder:** L-CV over `dL_i`; any sign flip = monotonicity violation.
- **Hue drift (Ch. 2.1):** max |h_i − h_first| (360° wrap), skipping achromatic steps (C < 0.03). Hue-proof swatches re-render first-step vs worst-drift hue at identical L = 0.6, C = 0.2 via `genFromLch` — any visible difference is hue alone.
- **Gray tint (Ch. 2.2, new):** C per gray token via `genToLch`; tinted ⇔ C ≥ 0.03; neutral twin = `genFromLch([measured L, 0, 0])`. Asserted: Material/Radix C < 0.001 everywhere, the Tailwind/Chakra dead heat (ΔC < 0.001), every tinted gray is cool (hue 220–280°).
- **Mid-shade lineup (Ch. 2.3, new):** L and hue of each system's documented mid step (500; Radix 9; Primer 5); asserted all six blues pairwise above the near-duplicate threshold and L spread > 0.1.
- **Weight + contrast (Ch. 3, new):** mid-row weight spread = max − min L across blue/red/green/gray at the mid step; white-text contrast via `contrastRatio('#ffffff', hex)`, PASS ⇔ ≥ 4.5 (WCAG AA). Every badge asserted at build time.
- **Lightness skeleton:** each token re-rendered as neutral gray at its measured L via `genFromLch([L, 0, 0])`.
- **Near-duplicate honesty gate:** any "spot the boundary" / seamless side-by-side visual requires `hl.difference(pair) < 0.025` or the build **fails**; the build also asserts the gate is real (Primer gray 4→5 at 0.019 passes; Material blue 400→500 at 0.044 is rejected).

The page also checks itself: at build time every text/background pair in the design is verified against WCAG (body AAA 7:1, secondary AA 4.5:1), every near-duplicate visual is verified against the honesty gate, and every headline claim (largest/smallest step, gray tints, blue-500 spreads, contrast verdicts, "what to steal" superlatives) is asserted against the data — the build fails otherwise.

## Reproduce it

```bash
git clone https://github.com/Grkmyldz148/color-audit
cd color-audit
npm install        # single dependency: helmlab (build-time only)
node build.mjs     # regenerates index.html from data/
```

- `data/tokens/*.json` — the raw hex tokens with npm package + version provenance
- `data/scorecard.json` — every measurement on the site
- `build.mjs` — the single source: derives all page numbers from the data, computes the Chapter 2–3 facts live via helmlab, and enforces the contrast self-check, the near-duplicate honesty gate, and the headline-claim assertions at build time; the emitted page is static HTML + inline SVG, no JavaScript

**Limitations:** this audit measures *scale quality only* — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about aesthetics, component design, or fitness for each system's intended workflow. Exact numbers are GenSpace-specific (orderings should be broadly stable across OKLab-class spaces).

---

Produced with the **color-skills** agent skills + the **helmlab** library.

```
npx skills add Grkmyldz148/color-skills
```

[helmlab.space/benchmark](https://helmlab.space/benchmark) · MIT © 2026 Görkem Yıldız
