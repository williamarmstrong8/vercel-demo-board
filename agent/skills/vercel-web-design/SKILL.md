---
description: Design polished static sites in the Vercel (Geist) visual style.
---

Build clean, high-contrast, content-first pages that feel like vercel.com.

## Type
- Use the Geist font family (fall back to system `-apple-system, Segoe UI, sans-serif`).
- Big, tight headings (font-weight 600-700, letter-spacing -0.02em). Generous
  line-height (1.5-1.6) for body copy. Never smaller than 14px for body text.

## Color
- Near-black text (#000 / #111) on white, or white on near-black for dark mode.
- One restrained accent at most. Lean on neutrals and plenty of whitespace.
- Use subtle 1px borders (#eaeaea light / #333 dark) instead of heavy shadows.

## Layout
- Center content in a max-width container (~1100px) with comfortable padding.
- Use CSS grid/flex, a sticky minimal header, and clear vertical rhythm.
- Rounded corners (8-12px), smooth hover transitions, and accessible focus rings.

## Quality bar
- Fully responsive (mobile-first), semantic HTML, and good contrast.
- No lorem-ipsum sprawl — write concise, real-sounding copy.
- Keep everything in one self-contained `index.html` (inline `<style>`/`<script>`)
  so it previews in a new tab. Never start a local server to preview it.

## Ship it in stages (fast first paint)
Never emit the whole site in one giant `write_file` — nothing is visible until it
fully generates, which feels like a hang. Instead:
1. Write a SHORT, complete `index.html` first — head + base `<style>` tokens +
   header/nav + hero with the real headline. Small, so it lands in ~seconds and
   the preview opens immediately.
2. Then rewrite the same `index.html` to add the remaining sections (features,
   pricing, footer). Each write updates the live preview, streaming progress in.

## Narrate before each step
The operator watches a live chat and sees nothing while a file is being written.
Type one short status line BEFORE every tool call — e.g. "Scaffolding the shell
and hero…", "Adding features and pricing…", "Wiring up the mobile nav…". These
stream in instantly so the operator always knows what's happening. One concise
sentence each; never narrate code or paste markup.
