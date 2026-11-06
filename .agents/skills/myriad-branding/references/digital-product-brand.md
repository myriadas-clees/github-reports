# Myriad Digital Product Brand

Source observations from `myriadas.com`, reviewed June 30, 2026:

- `https://myriadas.com/`
- `https://myriadas.com/technology/`
- `https://myriadas.com/advisor-club/`
- `https://myriadas.com/contact-page/`

`myriadas.com` is the public website domain. In product and marketing copy, refer to the company only as Myriad or Myriad Advisor Solutions—never as Myriadas or MyriadAS.

Use this reference when designing or updating Myriad apps, dashboards, onboarding flows, product pages, marketing pages, or any digital surface that should feel like part of the public website.

## Core Direction

Myriad products should feel like functional extensions of `myriadas.com`, not adjacent tools with a different brand. Use the website's confident, operational visual language while preserving the efficiency required by dense product screens.

The official brand guidelines remain authoritative for exact palette, logo rules, typography, imagery, and editorial style. This reference explains how to translate those rules into digital products and apps.

The source Myriad Apps repository implements this direction through the Graphical theme (`GUI.md`, `gui/source/graphical-theme.css`, and `gui/source/styles.css`); see "App theme in this repository" in `SKILL.md`. Where a website pattern below conflicts with the shipped theme, the theme governs app UI and the website pattern governs marketing and brand moments.

## Website-Derived Patterns

- Use dark charcoal, black, or image-backed header/hero surfaces for brand moments, page introductions, login screens, onboarding starts, product detail pages, and empty states.
- Use the white/red logo treatment on dark surfaces. Use approved light-background logo treatments on white work surfaces.
- Use Myriad red `#cc2647` only as an accent: short rules, the active navigation item, brand moments, and footer bands. Never use the reds (`#cc2647`, `#a12339`) for CTAs, buttons, actions, progress, focus fills, or shadows, on the website or in apps. CTAs and actions are monotone: Primary Gray `#202020`/black with white text, with neutral grays for secondary treatments. Do not flood screens with red.
- Use Roboto for UI, navigation, controls, headings, tables, forms, and labels. Favor lighter heading weights where the layout has enough contrast. The source apps load Roboto and Lora from licensed local font assets; do not add Google Fonts or other third-party font requests.
- Use Lora sparingly for warmer explanatory copy, welcome text, pull quotes, client-facing narrative, or support copy that should feel more human.
- Use Primary Gray `#202020` for dark bands and actions, and Secondary Gray `#e3e3e3` for hairlines and subtle surfaces.
- Use cool grays for structure: dividers, table borders, secondary text, muted panels, and inactive states.
- Use accessible muted gray `#66706f` for muted UI text. Keep Cool Gray 4 `#bbbdb7` for decorative structure where contrast is not required.
- Use monochrome or grayscale business imagery for brand moments. Avoid generic stock-photo warmth, decorative clip art, and AI-looking imagery.
- Use service-style icons as simple operational signals. Keep icons functional, consistent, and tied to tasks or service areas.

## Product UI Translation

App shells:

- Place the top bar or sidebar on the theme's raised neutral surface in both color modes, with one hairline edge toward the canvas, theme ink for text, icons on every navigation item, and a small red indicator on the current item.
- Keep the main work area calm, spacious, and scannable in both light and dark modes. Dark mode is a warm dark grey, not brown, blue-grey, or black.
- Use the M mark or compact logo for constrained navigation, in the variant that matches the surface: black on light and reverse on dark (`markAdaptive`). Use the full logo where there is enough horizontal room and clear space.

Page headers:

- For dashboards and repeated workflows, use a compact header on the page surface with a clear page title, one useful sentence, and one primary action.
- For landing, onboarding, or high-value setup moments, a larger website-like dark hero with restrained copy and one prominent monotone CTA (white on charcoal, or charcoal on white) is appropriate.
- Do not use oversized hero treatments inside routine admin screens.

Cards, tables, and forms:

- Use the theme's work surfaces, composed hairline edges (box shadows rather than borders), restrained shadows, and small red accents (never red actions or shadows).
- Keep card radius modest and consistent with product density.
- Prioritize tables, filters, segmented controls, tabs, and clear form grouping for operational work.
- In apps, use the charcoal action color for primary actions, gray or outline treatments for secondary actions, and the theme danger tokens for destructive actions and errors. Progress bars and meters are monotone. Focus rings follow the theme focus token and are never red fills.

Empty and loading states:

- Keep messages direct and useful. Lead with the user's next action.
- For high-visibility empty states, use a small dark branded band, M mark, or service icon rather than decorative illustration.
- Avoid casual, cute, or hype-heavy language.

## Messaging

Use copy that reinforces confidence, clarity, operational support, independence, advisory firms, RIAs, client focus, growth, and peace of mind.

Useful language patterns from the website:

- Confidence-driven growth
- Clarity, strategy, and hands-on support
- Focus on clients
- Grow with confidence
- Systems that keep the business running smoothly
- Structure, systems, and support
- Simplify, secure, and optimize
- Steady operations
- Time back
- Flexible support
- Peace of mind

Calls to action should be direct and specific, such as `Let's Talk`, `Get Started`, `Take the Next Step`, or a product-specific verb phrase. In apps, prefer action labels that state what happens, such as `Save changes`, `Start onboarding`, or `Review submission`.

## Service Vocabulary

Use these service labels consistently when they fit the product surface:

- Technology Solutions
- Compliance
- Unified Communications
- Business Services
- Marketing Services
- Cybersecurity
- Human Resources
- Transitions
- Advisor Club

## Contact Conventions

Use current website contact conventions when a product surface needs public contact details:

- General phone: `515-850-1212`
- General email: `info@myriadas.com`
- Address: `2520 SE Encompass Dr., Suite 200, Waukee, IA 50263`
- Support hours: `Monday-Friday, 7 AM-6 PM Central`

For formal documents that follow the letterhead source, use the contact format in `references/brand-guidelines.md`.

## Avoid

- Do not make Myriad apps look like generic SaaS templates with unrelated blues, purples, or decorative gradients.
- Do not copy the website's marketing composition into every dashboard. Apply the identity, then optimize the screen for work.
- Do not use the dark wallpaper or photo treatment as the default background behind dense tables and forms.
- Do not substitute unapproved colors when exact brand values matter.
- Do not download or bundle website assets unless the user explicitly asks and asset usage rights are clear.
