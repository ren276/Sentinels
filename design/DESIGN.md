# Design System Document: Technical Brutalism & Cinematic Precision

## 1. Overview & Creative North Star
**Creative North Star: "The Sentinel Interface"**

This design system moves away from the "friendly SaaS" aesthetic toward a high-stakes, cinematic, and data-driven environment. It is rooted in **Technical Brutalism**—a style that prioritizes raw functional density, razor-sharp edges (0px border radius), and an editorial use of monospaced typography. 

The experience must feel like a high-end command center. We break the "template" look through **intentional asymmetry**: using staggered text alignments and split-screen layouts where the left "data" panel feels like a living machine, while the right "input" panel acts as the clean, human interface. Depth is achieved not through shadows, but through the stacking of light-absorbent surfaces.

---

## 2. Colors & Surface Logic

The palette is anchored in deep obsidian tones, utilizing the Material Design surface-container logic to create "nested" environments.

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through background color shifts. For example, a `surface-container-low` input field should sit within a `surface` panel. The contrast between these two hex codes provides the "line" naturally.

### Surface Hierarchy
*   **Background (`surface` / `#121317`):** The absolute base.
*   **Low-Level Container (`surface-container-low` / `#1a1b20`):** Used for large structural zones (e.g., the right panel background).
*   **High-Level Surface (`surface-container-high` / `#292a2e`):** Used for interactive elements like active tabs or input fields.
*   **Primary Accent (`primary` / `#dbfcff`):** Reserved for critical data points, active states, and "SENTINEL" branding. This color should feel like a glowing phosphor on a terminal.

### The "Glass & Gradient" Rule
Floating elements (like live status chips) should utilize **Glassmorphism**. Apply `surface-variant` at 40% opacity with a `backdrop-filter: blur(12px)`. This allows the animated SVG dot grid in the background to bleed through, creating a sense of physical depth.

---

## 3. Typography: The Editorial Contrast

This system relies on the tension between the technical **DM Mono** and the surgical precision of **Geist**.

*   **Branding & Data (DM Mono):** Used for the "SENTINEL" logotype and the staggered headline "Predict failures before they happen." DM Mono conveys a sense of "under the hood" transparency.
*   **Interface & Action (Geist/Inter):** Used for all UI controls, labels, and form fields. Geist provides the modern, high-end readability required for professional tools.

**Typography Scale:**
*   **Display-LG (DM Mono):** 3.5rem. Staggered layout. Tracking: -0.02em.
*   **Headline-SM (Geist):** 1.5rem. For section titles.
*   **Label-MD (DM Mono):** 0.75rem. For technical metadata, live status chips, and "SENTINEL" branding. Uppercase with 0.1em letter spacing.

---

## 4. Elevation & Depth: Tonal Layering

We reject traditional drop shadows. We communicate "lift" through color and "Ghost Borders."

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural inset effect.
*   **Ambient Glow:** For the primary CTA (Sign In), instead of a shadow, use a subtle `0px 0px 20px` glow using the `primary` color at 15% opacity.
*   **The Ghost Border:** If a boundary is required for accessibility (e.g., an input field focus state), use the `outline-variant` token at 20% opacity. Never use 100% opaque borders.

---

## 5. Components

### Form Inputs (The "Inert" State)
*   **Styling:** No borders. Background: `surface-container-highest`.
*   **Corner:** Strictly `0px`.
*   **Focus State:** The background shifts to `surface-bright`. A 1px "Ghost Border" of `primary` at 30% appears.
*   **Label:** DM Mono, 0.6875rem, uppercase, `on-surface-variant` color.

### Tab Switcher (Sign In / Create Account)
*   **Structure:** A full-width `surface-container-low` track.
*   **Active State:** A `surface-container-highest` block that slides behind the text. No rounded corners.
*   **Text:** Geist, Title-SM. Active text is `primary`, inactive is `on-surface-variant`.

### Social Logins (GitHub, Google, Microsoft)
*   **Style:** Ghost buttons. Background: transparent.
*   **Border:** `outline-variant` at 20%.
*   **Hover:** Background becomes `surface-container-low`.

### Live Status Chips (Left Panel)
*   **Visuals:** `surface-variant` at 40% opacity. 
*   **Typography:** DM Mono, Label-SM.
*   **Indicator:** A 4px pulsing dot using `primary-container`.

### Buttons
*   **Primary:** Background: `primary`. Text: `on-primary` (Geist, Bold). No border.
*   **Secondary:** Background: `surface-container-highest`. Text: `on-surface`.
*   **Tertiary:** DM Mono, Label-MD, underlined on hover. No background.

---

## 6. Do's and Don'ts

### Do
*   **Do** use the spacing scale religiously. Use `spacing-20` (4.5rem) for the gap between the left and right panels to give the design "editorial air."
*   **Do** stagger the DM Mono headline text. Line 1: `margin-left: 0`, Line 2: `margin-left: 2rem`, Line 3: `margin-left: 1rem`.
*   **Do** use `surface-container-lowest` (#0d0e12) for the very bottom layer of the right-side form to create a "well" effect.

### Don't
*   **Don't** use border-radius. Everything must be 0px (sharp corners) to maintain the technical brutalist feel.
*   **Don't** use generic dividers. Use a `0.1rem` (spacing-0.5) vertical gap or a background shift to separate "Sign In" from "Social Logins."
*   **Don't** use pure white. All "white" text should be `on-surface` (#e3e2e7) to reduce eye strain in high-tech dark modes.