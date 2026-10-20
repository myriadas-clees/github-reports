---
name: myriad-branding
description: Use when creating or updating Myriad Advisor Solutions digital product UI, app screens, dashboards, websites, brand visuals, documents, pages, assets, layouts, typography, colors, logo usage, imagery direction, or editorial voice; align products and apps with myriadas.com and the official Myriad brand guidelines.
---

# Myriad Branding

## Overview

Use this skill to recreate the Myriad Advisor Solutions look, feel, and voice. Treat `myriadas.com` as the canonical digital expression for products, apps, dashboards, and websites. Treat the bundled brand guidelines as authoritative for exact logo, color, typography, and editorial specifications.

Keep outputs polished, operational, professional, spacious, and unmistakably Myriad.

## Brand name

- Use only **Myriad** or **Myriad Advisor Solutions** when referring to the company in copy, UI, titles, and documents.
- Never use **Myriadas**, **MyriadAS**, **Myriad AS**, or similar concatenations as a brand name.
- `myriadas.com` and addresses like `info@myriadas.com` are the website domain and contact email, not spoken or written brand names. Keep them as URLs and mailto links; do not turn the domain into a product or company label.

## Start Here

For exact specifications, read `references/brand-guidelines.md` before producing the final asset. For digital products, app screens, dashboards, onboarding flows, product pages, marketing pages, or site-inspired UI, also read `references/digital-product-brand.md`.

Use `assets/official-assets/` for clean logo, M-mark, and wallpaper files; use `assets/reference-pages/` as visual references; use `assets/letterhead-media/` as reusable extracted media.

For any branded deliverable:

1. Use Roboto for primary interface, heading, and label text.
2. Use Lora for editorial accents, pull quotes, refined subheads, or body copy where a softer professional tone helps.
3. Use the core palette: Primary Red `#cc2647`, Secondary Red `#a12339`, Pantone deep teal `#3d646b`, Primary Gray `#202020`, and Secondary Gray `#e3e3e3`. Reds are accents only, never actions or progress. In apps, the theme's neutrals carry the surface and red stays an accent (see App theme in this repository).
4. Make digital products feel like functional extensions of `myriadas.com`.
5. Use only approved logo treatments and respect clear space.
6. Apply Myriad editorial style to all client-facing copy.

## Digital Product Pattern

Use the live website as the model for Myriad apps and product surfaces. Translate its dark charcoal or image-backed hero/header fields, white/red logo treatments, lightweight Roboto headings, Lora support copy, monotone calls to action (Primary Gray and white), cool-gray structure, monochrome imagery, service icons, and dark header/footer bands into usable product UI.

Apps should not become generic SaaS dashboards. They should feel like Myriad operational tools: calm, regulated-industry-ready, confident, and closely tied to the public website. Adapt the website for dense work screens with compact page headers, theme work surfaces, composed hairline edges, restrained typography, and red used as a signal rather than a fill.

Do not copy marketing layouts literally into dashboards. Preserve scannability, table density, predictable navigation, accessible forms, and efficient repeated workflows.

### App theme in this repository

The source Myriad Apps repository uses the Graphical theme. Follow `GUI.md`. Current token and alias references are copied to `gui/source/graphical-theme.css` and `gui/source/styles.css`. Where this skill's references describe dark shells for apps, the shipped theme below takes precedence; those references still govern documents, marketing pages, and brand moments. Red buttons are not allowed anywhere.

- **Both modes are first class.** Every screen, popup, and portal follows the active light or dark mode. Dark mode is a warm dark grey with a slight warm hue and very low chroma: not brown, not cool blue-grey, and not pure black.
- **Shell.** The sidebar and top bar sit on the theme's raised neutral surface (`neutral-2`) in both modes, with one composed edge toward the canvas. They are not a dark band in light mode.
- **Navigation.** Items are transparent at rest and `neutral-3` on hover; the current item uses the theme's navigation-active tokens, with a small red indicator (`--nav-accent`). In dark mode the indicator uses the theme error red, because `#cc2647` falls below 3:1 contrast there. Keep icons on navigation items in both the top-bar and sidebar layouts.
- **Logo.** Use the mode-appropriate mark: black on light surfaces and reverse on dark ones. `markAdaptive` switches it automatically. Never place the full-color primary logo on a dark surface.
- **Actions.** Primary buttons are charcoal (`--action`, `neutral-10`) with `--action-foreground`. Progress bars and meters are monotone too. Never use the reds for actions, buttons, progress, focus fills, or shadows; reserve them for accents, the active-navigation indicator, short rules, and brand moments. Use the danger tokens (`--danger-text`, `--danger-tint-text`) for destructive or error states, so each mode meets contrast.
- **Values.** Use theme tokens and the `@theme` bridges (`text-step-*`, `*-space-*`, `rounded-s/m/l`, `bg-neutral-*`) instead of literal hex, pixel, or palette values in app UI.
- **Fonts.** Roboto and Lora are self-hosted from the source repository’s licensed font assets (SIL Open Font License 1.1) through the source repository’s `fonts.css`. Do not add Google Fonts or other third-party font requests.

## Document Pattern

Use the letterhead as the core composition model for documents, print-like pages, letters, PDFs, and formal collateral: clean white field, thin red top rule, top-right logo placement, and a red footer/contact band when the medium supports it.

Avoid one-note red layouts. Myriad should feel operationally clear, executive, and calm: red is an anchor and signal color, not a full-page wash unless reproducing a brand color block or footer.

## Asset Use

- `assets/reference-pages/logo-primary-submark.png`: primary logo and submark visual reference.
- `assets/reference-pages/logo-variations.png`: white-background and reverse logo rules.
- `assets/reference-pages/logo-clear-space.png`: clear-space reference.
- `assets/reference-pages/color-palette.png`: official palette.
- `assets/reference-pages/typography-roboto.png` and `assets/reference-pages/typography-lora.png`: font references.
- `assets/reference-pages/approved-icons.png`: icon style reference.
- `assets/reference-pages/imagery-do.png` and `assets/reference-pages/imagery-dont.png`: imagery direction.
- `assets/reference-pages/letterhead-layout.png`: canonical document composition.
- `assets/official-assets/myriad-primary-logo-wide-image001.png`: clean wide primary logo PNG.
- `assets/official-assets/myriad-primary-logo-wide-image001-002.png`: duplicate source copy of the same wide primary logo PNG.
- `assets/official-assets/myriad-logo-sm-black-186-v1.jpg`: compact black/red primary logo JPG.
- `assets/official-assets/myriad-m-mark-304x304.png`: clean M submark PNG.
- `assets/official-assets/wallpaper-myriad-v05.jpg`: dark Myriad wallpaper/background JPG.
- `assets/letterhead-media/footer-gradient-bar.png`, `top-red-rule.png`, and contact icons: reusable letterhead media.

Prefer `assets/official-assets/` for logo placement. The extracted `logo-fragment-*` and `advisor-solutions-wordmark-fragment.png` files are partial DOCX fragments, not complete official logo artwork. Do not present them as standalone logo sources.

## Common Mistakes

- Do not refer to the company as Myriadas, MyriadAS, Myriad AS, or any similar concatenation; use Myriad or Myriad Advisor Solutions only.
- Do not use the primary full-color logo on dark backgrounds; use the reverse version only when there is enough contrast.
- Do not crowd the logo; clear space equals the width of the stem on the M.
- Do not substitute generic red, gray, or teal values when exact palette values matter.
- Do not make product apps feel separate from `myriadas.com`; they should share the same digital brand language.
- Do not use Myriad red on buttons, CTAs, links-as-actions, progress bars, focus fills, or shadows, and do not fill navigation bars with it; use the charcoal action color and keep red to accents.
- Do not ship an app screen, dropdown, or dialog that only works in one color mode, or tint dark mode brown or blue.
- Do not turn dashboards into marketing pages; apply the website's identity to practical operational layouts.
- Do not use decorative clip art, overly posed stock imagery, centered hands, or AI-looking visuals.
- Do not make Myriad copy casual, hype-heavy, or vague. Keep it direct, useful, and client-centered.
