export const DEMO_URL = "/demo"; 
export const APP_URL = "https://app.situsrevenue.com";
export const SIGNUP_URL = APP_URL + "/signup";

export const FEATURES = [
  { icon: "◈", title: "Dashboard",       desc: "Unified revenue visibility across every metric that matters." },
  { icon: "◎", title: "Deals",           desc: "Track opportunities, progression, and deal health in real time." },
  { icon: "◐", title: "Leads",           desc: "Manage and prioritize leads with intelligent scoring." },
  { icon: "◉", title: "Pipeline",        desc: "Understand bottlenecks, flow, and stage velocity." },
  { icon: "◍", title: "Forecasting",     desc: "Predict future revenue performance with confidence." },
  { icon: "△", title: "Alerts",          desc: "Stay informed the moment something important changes." },
  { icon: "⬡", title: "Analytics",       desc: "Deep performance tracking and trend analysis." },
  { icon: "✦", title: "AI Intelligence", desc: "Actionable insights and recommendations powered by AI." },
];

export const INTEGRATIONS = [
  "Salesforce", "HubSpot", "Slack", "Zoom", "Microsoft Teams", "Gmail", "Outlook",
];

export const FAQS = [
  {
    q: "What is Situs?",
    a: "Situs is an AI Decision & Revenue Intelligence System that helps revenue teams understand what matters, what is changing, and what action should happen next.",
  },
  {
    q: "How is it different from a CRM?",
    a: "A CRM stores data. Situs turns that data into decisions. We sit on top of your existing systems and surface intelligence, not just records.",
  },
  {
    q: "Who should use it?",
    a: "Founders, sales leaders, and revenue operations teams who need pipeline visibility, forecast confidence, and risk detection in one place.",
  },
  {
    q: "What integrations are available?",
    a: "Situs is designed to connect with modern revenue tools. Planned integrations include Salesforce, HubSpot, Slack, Zoom, Gmail, and Outlook.",
  },
  {
    q: "What is included in beta?",
    a: "Beta includes the full dashboard, deals, leads, pipeline, forecasting, alerts, analytics, AI intelligence, and PDF intelligence reports.",
  },
  {
    q: "How do intelligence reports work?",
    a: "Situs generates structured PDF reports that surface revenue risks, deal opportunities, and performance trends — helping teams act before it is too late.",
  },
];

/* ──────────────────────────────────────────────────────────────────
   DESIGN SYSTEM — single source of truth
   Tokens → utilities → components. Change once, applies everywhere.
   ────────────────────────────────────────────────────────────────── */

export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  /* ── Tokens ── */
  :root {
    /* Brand */
    --c-ink:        #0A0A0A;
    --c-ink-soft:   #1A1A1A;
    --c-indigo:     #6366F1;
    --c-violet:     #8B5CF6;
    --c-emerald:    #10B981;
    --c-green:      #22C55E;
    --c-amber:      #F59E0B;
    --c-red:        #EF4444;

    /* Surfaces */
    --s-base:       #FFFFFF;
    --s-raised:     #FAFAFA;
    --s-sunken:     #F4F4F5;
    --s-border:     #EBEBEB;
    --s-border-2:   #E2E2E2;

    /* Text */
    --t-primary:    #0A0A0A;
    --t-secondary:  #555555;
    --t-tertiary:   #888888;
    --t-faint:      #AAAAAA;

    /* Motion — Doherty: every interaction responds <400ms */
    --ease:         cubic-bezier(.16, 1, .3, 1);
    --speed-fast:   0.15s;
    --speed-base:   0.25s;
    --speed-slow:   0.4s;

    /* Depth */
    --shadow-sm:    0 1px 3px rgba(0,0,0,0.05);
    --shadow-md:    0 4px 16px rgba(0,0,0,0.07);
    --shadow-lg:    0 16px 40px rgba(0,0,0,0.1);
    --shadow-xl:    0 32px 64px rgba(0,0,0,0.12);

    /* Radii */
    --r-sm:  8px;
    --r-md:  12px;
    --r-lg:  16px;
    --r-xl:  20px;
    --r-2xl: 28px;

    /* Layout */
    --container: 1200px;
    --gutter:    48px;
    --section-y: 140px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html { scroll-behavior: smooth; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--s-base);
    color: var(--t-primary);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }

  ::selection { background: rgba(99,102,241,0.2); color: var(--c-ink); }

  /* ── Accessibility: visible keyboard focus everywhere ── */
  :focus-visible {
    outline: 2px solid var(--c-indigo);
    outline-offset: 3px;
    border-radius: 4px;
  }
  :focus:not(:focus-visible) { outline: none; }

  /* ── Accessibility: respect reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* ── Typography scale ── */
  .h-display {
    font-size: clamp(44px, 6vw, 80px);
    font-weight: 900;
    line-height: 1.02;
    letter-spacing: -0.045em;
    color: var(--t-primary);
  }
  .h-section {
    font-size: clamp(32px, 3.5vw, 52px);
    font-weight: 900;
    line-height: 1.08;
    letter-spacing: -0.04em;
    color: var(--t-primary);
  }
  .t-lead {
    font-size: 18px;
    line-height: 1.72;
    color: var(--t-secondary);
    letter-spacing: -0.015em;
    font-weight: 400;
  }
  .t-body {
    font-size: 14px;
    line-height: 1.7;
    color: #777;
    font-weight: 400;
  }

  .gradient-text {
    background: linear-gradient(135deg, var(--c-indigo), var(--c-emerald));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .gradient-text-warm {
    background: linear-gradient(135deg, #FBBF24, var(--c-amber));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Badge (Law of Similarity — identical across all sections) ── */
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.08));
    border: 1px solid rgba(99,102,241,0.15);
    border-radius: 100px; padding: 6px 14px;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--c-indigo); margin-bottom: 22px;
  }
  .badge::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: linear-gradient(135deg, var(--c-indigo), var(--c-emerald));
  }
  .badge--dark {
    background: rgba(99,102,241,0.12);
    border-color: rgba(99,102,241,0.25);
    color: #818CF8;
  }
  .badge--red    { background: rgba(239,68,68,0.06);  border-color: rgba(239,68,68,0.15);  color: #DC2626; }
  .badge--red::before    { background: var(--c-red); }
  .badge--amber  { background: rgba(245,158,11,0.1);  border-color: rgba(245,158,11,0.2);  color: #D97706; }
  .badge--amber::before  { background: var(--c-amber); }

  /* ── Buttons (Fitts: min 44px tap height) ── */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px;
    border-radius: 10px; padding: 12px 28px;
    font-size: 15px; font-weight: 700; font-family: inherit;
    cursor: pointer; text-decoration: none;
    letter-spacing: -0.02em; border: none;
    transition: transform var(--speed-base) var(--ease),
                box-shadow var(--speed-base) var(--ease),
                background var(--speed-base) var(--ease),
                border-color var(--speed-base) var(--ease);
  }
  .btn:active { transform: scale(0.98); }

  .btn--primary {
    background: linear-gradient(135deg, var(--c-ink) 0%, var(--c-ink-soft) 100%);
    color: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .btn--primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
  }

  .btn--secondary {
    background: rgba(255,255,255,0.9);
    color: var(--t-primary);
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(8px);
  }
  .btn--secondary:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: rgba(0,0,0,0.2);
  }

  .btn--white {
    background: #fff; color: var(--c-ink);
    box-shadow: 0 8px 32px rgba(255,255,255,0.15);
  }
  .btn--white:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(255,255,255,0.25); }

  .btn--gradient {
    background: linear-gradient(135deg, var(--c-indigo), var(--c-violet));
    color: #fff;
    box-shadow: 0 8px 32px rgba(99,102,241,0.4);
  }
  .btn--gradient:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(99,102,241,0.5); }

  .btn--sm { min-height: 38px; padding: 8px 18px; font-size: 13px; }

  /* ── Cards (Common Region — clear bounded groups) ── */
  .card {
    background: var(--s-raised);
    border: 1px solid var(--s-border);
    border-radius: var(--r-lg);
    transition: transform var(--speed-base) var(--ease),
                box-shadow var(--speed-base) var(--ease),
                border-color var(--speed-base) var(--ease),
                background var(--speed-base) var(--ease);
  }

  /* ── Section divider line ── */
  .section-line {
    position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 800px; max-width: 80%; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99,102,241,0.25), rgba(16,185,129,0.25), transparent);
  }

  /* ── Animations ── */
  @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes float   { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

  /* ══════════════════════════════════════════════════════════════
     RESPONSIVE — tablet & mobile
     Fixes: squished columns, oversized text, excessive spacing
     ══════════════════════════════════════════════════════════════ */

  /* ── Tablet & down (≤900px) ── */
  @media (max-width: 900px) {
    :root { --gutter: 24px; --section-y: 72px; }

    /* Every multi-column grid collapses to ONE column */
    .four-col,
    .three-col,
    .two-col {
      grid-template-columns: 1fr !important;
      gap: 16px !important;
    }

    /* Catch inline-styled grids too (Hero stats, dashboard metrics, etc.) */
    [style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    /* Bento "large" cards stop spanning 2 columns */
    .span-2 { grid-column: span 1 !important; }

    .nav-links   { display: none !important; }
    .hide-mobile { display: none !important; }

    /* Buttons full-width & stacked */
    .btn     { width: 100%; }
    .btn-row { flex-direction: column; align-items: stretch !important; }

    /* Shrink headlines & body text */
    .h-display { font-size: clamp(30px, 8.5vw, 42px) !important; line-height: 1.1  !important; }
    .h-section { font-size: clamp(24px, 6.5vw, 34px) !important; line-height: 1.15 !important; }
    .t-lead    { font-size: 16px !important; }
    .t-body    { font-size: 13px !important; }

    /* Tame the big section side-padding */
    section, footer {
      padding-left: 24px !important;
      padding-right: 24px !important;
    }
  }

  /* ── Phones (≤480px) ── */
  @media (max-width: 480px) {
    :root { --gutter: 16px; --section-y: 56px; }

    .h-display { font-size: 28px !important; }
    .h-section { font-size: 22px !important; }
    .t-lead    { font-size: 15px !important; }

    section, footer {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }

    /* Collapse the giant 100–140px vertical paddings on phones */
    [style*="padding: 100px"],
    [style*="padding: 120px"],
    [style*="padding: 140px"] {
      padding: 56px 16px !important;
    }

    /* Smaller radii feel tighter on small screens */
    .card { border-radius: var(--r-md); }
  }
`;
