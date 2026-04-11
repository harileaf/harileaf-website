/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],

  // ─── Container: max-w-7xl centered with responsive side padding ───
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem',  // 24px — px-6 on mobile
        md: '1.5rem',
        lg: '2rem',         // 32px — px-8 on desktop
        xl: '2rem',
        '2xl': '2rem',
      },
      screens: {
        '2xl': '1280px',    // Matches max-w-7xl used throughout designs
      },
    },

    extend: {

      // ─── Colors ─────────────────────────────────────────────────────
      // Source: brand_tokens.css, color_palette.png, and the full
      // Material Design 3 token set present in every design HTML file.
      //
      // Naming mirrors the design files exactly so classes like
      // `bg-surface-container-low` and `text-on-surface-variant` work
      // without any translation layer.
      colors: {

        // ── Primary: Hari Teal (dark) — brand authority & key actions ──
        primary:                    '#196a5e',
        'on-primary':               '#ffffff',
        'primary-container':        '#7fc8ba',
        'on-primary-container':     '#00544a',
        'primary-fixed':            '#a7f1e2',
        'primary-fixed-dim':        '#8bd4c6',
        'on-primary-fixed':         '#00201b',
        'on-primary-fixed-variant': '#005047',
        'inverse-primary':          '#8bd4c6',
        'surface-tint':             '#196a5e',

        // ── Secondary: Leaf Olive — growth accents, natural highlights ──
        secondary:                    '#546437',
        'on-secondary':               '#ffffff',
        'secondary-container':        '#d7eab1',
        'on-secondary-container':     '#5a6a3d',
        'secondary-fixed':            '#d7eab1',
        'secondary-fixed-dim':        '#bbcd97',
        'on-secondary-fixed':         '#131f00',
        'on-secondary-fixed-variant': '#3d4c22',

        // ── Tertiary: Soil Brown — grounding & warm accents ─────────────
        tertiary:                    '#6c5c4c',
        'on-tertiary':               '#ffffff',
        'tertiary-container':        '#ccb7a4',
        'on-tertiary-container':     '#574839',
        'tertiary-fixed':            '#f5dfca',
        'tertiary-fixed-dim':        '#d8c3af',
        'on-tertiary-fixed':         '#25190d',
        'on-tertiary-fixed-variant': '#534435',

        // ── Surface hierarchy: fine-paper layering (no harsh lines) ─────
        // Base:    surface (#f7faf4) — the page background
        // Lift 1:  surface-container-low  — large section blocks
        // Lift 2:  surface-container       — mid containers
        // Lift 3:  surface-container-high  — input fields
        // Lift 4:  surface-container-highest — chips, tags
        // Cards:   surface-container-lowest (#fff) inside lift-1 sections
        surface:                    '#f7faf4',
        'surface-bright':           '#f7faf4',
        'surface-dim':              '#d8dbd5',
        'surface-variant':          '#e0e3dd',
        'surface-container-lowest': '#ffffff',
        'surface-container-low':    '#f1f5ee',
        'surface-container':        '#ecefe8',
        'surface-container-high':   '#e6e9e3',
        'surface-container-highest':'#e0e3dd',
        'on-surface':               '#191d19',   // near-black — headings
        'on-surface-variant':       '#3f4946',   // body copy
        'inverse-surface':          '#2d312d',
        'inverse-on-surface':       '#eff2eb',

        // ── Background (same as surface — Material 3 separation) ────────
        background:                 '#f7faf4',
        'on-background':            '#191d19',

        // ── Outline ─────────────────────────────────────────────────────
        outline:                    '#6f7976',
        'outline-variant':          '#bec9c5',   // used at 10–15% opacity

        // ── Error / status ───────────────────────────────────────────────
        error:                      '#ba1a1a',
        'on-error':                 '#ffffff',
        'error-container':          '#ffdad6',
        'on-error-container':       '#93000a',

        // ── Brand primitives (from brand_tokens.css + color_palette.png) ─
        // These are the raw brand swatches before the MD3 tonal expansion.
        // Use these for illustrations, marketing assets, and gradient ends.
        brand: {
          teal:     '#7fc8ba',   // Hari Teal    — gradient start (RGB 127,200,186)
          olive:    '#9fb17d',   // Leaf Olive   — gradient end   (RGB 159,177,125)
          forest:   '#2e3a2e',   // Deep Forest  — dark bg / footer (RGB 46,58,46)
          soil:     '#6b5b4b',   // Soil Brown   — warm tertiary  (RGB 107,91,75)
          offwhite: '#f7f9f5',   // Off White    — backgrounds    (RGB 247,249,245)
          midgrey:  '#6b6f6a',   // Mid Grey     — neutral text   (RGB 107,111,106)
          // Tonal scale for teal (programmatic, covers 50–950 range)
          50:  '#f0faf8',
          100: '#d6f1ec',
          200: '#a7e4da',
          300: '#7fc8ba',   // ← brand.teal (official Hari Teal)
          400: '#56b0a0',
          500: '#3a9589',
          600: '#196a5e',   // ← primary (interactive Hari Teal dark)
          700: '#145a4f',
          800: '#0e4640',
          900: '#083330',
          950: '#041a18',
        },

        // ── Olive / secondary scale ──────────────────────────────────────
        olive: {
          50:  '#f5f9ee',
          100: '#e9f2d5',
          200: '#d7eab1',   // ← secondary-container
          300: '#bbcd97',
          400: '#9fb17d',   // ← brand.olive (official Leaf Olive)
          500: '#7e9460',
          600: '#546437',   // ← secondary (interactive dark)
          700: '#485730',
          800: '#374228',
          900: '#263020',
          950: '#131f00',
        },
      },

      // ─── Background images ───────────────────────────────────────────
      // The signature brand gradient: Hari Teal → Leaf Olive.
      // Per DESIGN.md: "reserved for hero backgrounds, large-scale CTAs,
      // and primary data visualizations."
      backgroundImage: {
        'brand-gradient':   'linear-gradient(135deg, #7fc8ba 0%, #9fb17d 100%)',
        'brand-gradient-r': 'linear-gradient(to right, #7fc8ba, #9fb17d)',
        'brand-gradient-b': 'linear-gradient(to bottom, #7fc8ba, #9fb17d)',
        'brand-gradient-tl':'linear-gradient(to top left, #7fc8ba, #9fb17d)',
        // Soft hero overlay (surface fade for text legibility)
        'hero-overlay':     'linear-gradient(to right, #f7faf4 0%, rgba(247,250,244,0.4) 60%, transparent 100%)',
      },

      // ─── Typography ─────────────────────────────────────────────────
      // Manrope is used exclusively across all design files.
      // Weights used: 200 (extralight), 400 (regular), 500 (medium),
      // 600 (semibold), 700 (bold), 800 (extrabold).
      // The variable font covers the full 200–800 range.
      fontFamily: {
        sans:     ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        manrope:  ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        headline: ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        body:     ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        label:    ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
      },

      // ─── Font sizes (named scale from DESIGN.md) ─────────────────────
      // These complement Tailwind's default text-sm/base/lg/xl etc.
      // and add the semantic names used in the DESIGN.md spec.
      fontSize: {
        // Display — hero headlines only. 56px on lg, used as text-6xl/7xl responsive.
        'display-lg': ['3.5rem',  { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display':    ['3rem',    { lineHeight: '1.1',  letterSpacing: '-0.02em',  fontWeight: '800' }],
        // Headline — primary section headers
        'headline-lg':['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.02em',  fontWeight: '800' }],
        'headline':   ['1.75rem', { lineHeight: '1.2',  letterSpacing: '-0.015em', fontWeight: '700' }],
        // Title — card titles, nav labels
        'title-lg':   ['1.375rem',{ lineHeight: '1.3',  letterSpacing: '-0.01em',  fontWeight: '700' }],
        'title':      ['1.125rem',{ lineHeight: '1.4',  letterSpacing: '-0.005em', fontWeight: '700' }],
        // Body — already in Tailwind defaults (text-base = 1rem, text-lg = 1.125rem)
        // Label — micro-copy, captions, tags. Always uppercase in the designs.
        'label-lg':   ['0.875rem',{ lineHeight: '1.2',  letterSpacing: '0.05em',   fontWeight: '700' }],
        'label':      ['0.75rem', { lineHeight: '1.1',  letterSpacing: '0.05em',   fontWeight: '700' }],
      },

      // ─── Border radius ───────────────────────────────────────────────
      // DESIGN.md: "roundedness-lg (1rem)" for cards.
      // "roundedness-md" for inputs.
      // "full" for pills/buttons.
      // 2xl/3xl observed in hero images and bento cards (about_us page).
      borderRadius: {
        DEFAULT: '0.25rem',   // 4px  — base elements
        sm:      '0.5rem',    // 8px  — tags, chips
        md:      '0.75rem',   // 12px — inputs (roundedness-md)
        lg:      '1rem',      // 16px — cards (roundedness-lg per DESIGN.md)
        xl:      '1.5rem',    // 24px — large section cards
        '2xl':   '2rem',      // 32px — hero images (about page: rounded-[2rem])
        '3xl':   '2.5rem',    // 40px — bento mission/vision cards
        full:    '9999px',    // pills — all buttons use this
      },

      // ─── Box shadows ─────────────────────────────────────────────────
      // DESIGN.md: "Y-offset: 8px, Blur: 24px, Color: on-surface at 6% opacity"
      // Standard drop shadows are prohibited. These ambient shadows mimic
      // natural sunlight hitting a soft surface.
      boxShadow: {
        ambient: '0 8px 24px rgba(25, 29, 25, 0.06)',    // DESIGN.md spec — floating elements
        card:    '0 2px 8px rgba(25, 29, 25, 0.04)',     // subtle card lift
        float:   '0 16px 40px rgba(25, 29, 25, 0.12)',   // modals, dropdowns, hero cards
        'primary-glow': '0 8px 24px rgba(25, 106, 94, 0.20)',  // primary CTA hover
        'teal-glow':    '0 8px 32px rgba(127, 200, 186, 0.35)', // gradient element glow
      },

      // ─── Spacing extras ──────────────────────────────────────────────
      // Designs use py-24 (96px) as the primary section rhythm.
      // These semantic names match the spacing intent from DESIGN.md.
      spacing: {
        'section':    '6rem',    // 96px — standard section vertical padding
        'section-sm': '4rem',    // 64px — compressed sections (mobile)
        'section-lg': '8rem',    // 128px — hero sections
        'container':  '1280px',  // max-w-7xl equivalent for manual usage
      },

      // ─── Screens ─────────────────────────────────────────────────────
      // Keeping Tailwind defaults (sm/md/lg/xl/2xl). No overrides needed —
      // the designs use standard breakpoints.
    },
  },

  plugins: [],
}
