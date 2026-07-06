# The Open-Source Color Audit

**Measuring the color scales of popular open-source design systems — perceptual step uniformity, hue drift, contrast. Reproducible.**

There is no perfect color space, and there is no perfect palette — so instead of guessing which design system "got color right," we measure. Every hex token from six widely-copied systems (Tailwind CSS v4, GitHub Primer, Material Design, Bootstrap 5, Radix Colors, Chakra UI — 24 scales, 252 tokens) is mapped into helmlab's perceptually uniform GenSpace and scored on four things a color scale actually promises: even perceptual steps, a monotone lightness ladder, a hue that stays put, and a usable mid-shade contrast. The result is a ranked, reproducible scorecard — with credit given where the numbers earn it.

**Live site: https://grkmyldz148.github.io/color-audit/**

## Ranked scorecard (by mean step-distance CV, lower = more even)

| # | System | Mean step CV % | Mean L-CV % | Worst hue drift | Monotonicity violations | Mid fails AA both ways |
|---|--------|---------------:|------------:|----------------:|------------------------:|-----------------------:|
| 1 | **Chakra UI** | 41.6 | 28.2 | 20.5° (blue) | 0 | 0 |
| 2 | **GitHub Primer** | 44.2 | 41.4 | 27.6° (blue) | 0 | 0 |
| 3 | **Bootstrap 5** | 44.6 | 24.1 | 11.9° (red) | 0 | 0 |
| 4 | **Tailwind CSS v4** | 45.6 | 43.1 | 13.2° (red) | 0 | 0 |
| 5 | **Material Design (2014)** | 56.6 | 42.9 | 20.8° (red) | 0 | 0 |
| 6 | **Radix Colors** | 101.6 | 95.9 | 17.2° (blue) | 0 | 0 |

> **Radix caveat:** Radix Colors documents its 12 steps as *use-case roles* (backgrounds, component states, solid, text), not an even ramp. Uniformity metrics measure a contract it never signed; re-scored on interior steps 2–11 its blue and green become respectable (step CV 30.8% / 37.3%). Judged as a role system it is coherent.

## Top findings

1. **Every scale is monotone, everywhere.** All 24 scales are strictly monotone in GenSpace lightness — zero L-reversals across 228 steps — and no system's mid shade is a contrast dead zone (every mid reaches ≥ 4.5 against white or black).
2. **Primer red is the single most even chromatic scale in the audit** (step CV 16.9%, max/min only 1.8×), and Primer is the only system where every chromatic mid clears WCAG AA against white — clearly engineered. Its 14-step neutral, though, behaves like two scales glued together (steps 4→5 = 0.011 vs 7→8 = 0.206, an 18.6× spread), and its blue drifts 27.6° — the largest hue drift measured.
3. **Tailwind v4's oklch redesign shows in the hue numbers**: blue drifts only 9.6°, gray 6.9°, worst case 13.2°. But blue 500→600 is only 0.045 while 200→300 is 0.219 — the two most-used button shades are the perceptually closest pair in the ramp.
4. **Bootstrap's mechanical `mix()` ramps have the most disciplined lightness of any system** (mean L-CV 24.1%; green is the audit's best single scale at L-CV 7.5%) and near-immovable hue (blue drifts 2.9°) — but pay for it at the light end of blue with an 8.0× step imbalance, because equal RGB mixing is not equal perceptual spacing.
5. **Material's 2014 palette shows its age at the ramp ends**: blue 400→500 is just 0.026 (#42a5f5 and #2196f3 are near-duplicates) and red's L-CV (65.5%) is the worst chromatic lightness ladder measured. Credit where due: its green is clean and its gray is perfectly achromatic in GenSpace.

Chakra UI takes rank 1 not with a star scale but with no weak one — its three chromatic L-CVs (18.2–19.0%) are the most consistent trio in the audit.

## Methodology

Every hex token is mapped into **helmlab GenSpace** (`hl.genFromHex(hex)` → `[L, a, b]`, L in 0–1; `hl.genToLch` → `[L, C, h°]`). Per scale:

**1 · Step-distance consistency**

```
d_i     = GenSpace Euclidean distance(token_i, token_{i+1})
step CV = std(d) / mean(d) × 100          (plus max/min ratio)
```

**2 · Lightness uniformity & monotonicity**

```
dL_i = L_{i+1} − L_i
L-CV = std(dL) / |mean(dL)| × 100         (any sign flip → monotonicity violation)
```

**3 · Hue drift**

```
drift = max_i |h_i − h_first|   with 360° wrap,
        skipping steps with C < 0.03 as achromatic
```

**4 · Contrast** — WCAG `contrastRatio` of the mid shade (500, or step 9 for Radix / step 5 for Primer chromatics) against `#ffffff` and `#000000`, flagged if below 4.5 both ways.

**Limitations:** this audit measures *scale quality only* — how evenly and predictably a ramp is spaced in a perceptual space. It says nothing about overall design quality, aesthetics, component design, or fitness for a system's intended workflow. Radix is role-based by design (see caveat above). Exact numbers are space-specific, though orderings should be broadly stable across OKLab-class spaces.

## Reproducibility

```
node build.mjs
```

regenerates `index.html` from the checked-in data — no dependencies, no network.

- `data/scorecard.json` — all per-scale and aggregate numbers
- `data/tokens/*.json` — raw hex tokens with source package versions:
  `tailwindcss@4.3.2` (theme.css, oklch → sRGB via culori), `@primer/primitives@11.9.0` (figma/scales/light.json), `material-colors@1.2.6` (2014 spec palette), `bootstrap@5.3.8` (scss/_variables.scss; chromatic ramps generated per Bootstrap's own `tint-color`/`shade-color` sass `mix()` definitions), `@radix-ui/colors@3.0.0` (light scales), `@chakra-ui/theme@3.4.6` (foundations/colors)

## Credits

This audit was produced with the **color-skills** agent skills + the **helmlab** library.

```
npx skills add Grkmyldz148/color-skills
```

- helmlab benchmark: https://helmlab.space/benchmark
- Live site: https://grkmyldz148.github.io/color-audit/

## License

MIT © 2026 Görkem Yıldız — see [LICENSE](LICENSE).
