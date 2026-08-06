// feature-details.ts
//
// Single source of truth for the 8 product modules — powers both the
// Product.tsx bento grid AND the /features/[slug] detail pages, so
// icon/title/desc never drift between the teaser and the full page.

export type FeatureDetail = {
  slug: string;
  icon: string;
  title: string;
  desc: string;          // short teaser (bento card)
  tagline: string;       // one-line hero subhead on the detail page
  overview: string;      // 2-3 sentence expanded description
  capabilities: string[]; // "What it does" bullet list
  howItWorks: string[];   // 3-step process
  stat: { value: string; label: string };
};

export const FEATURE_DETAILS: FeatureDetail[] = [
  {
    slug: "dashboard",
    icon: "◈",
    title: "Dashboard",
    desc: "Unified revenue visibility across every metric that matters.",
    tagline: "One screen. Every number that matters. Zero tab-switching.",
    overview:
      "Your dashboard pulls pipeline value, revenue, risk, and escalations into a single live view — updated in real time as deals move. No more stitching together spreadsheets or waiting on someone to export a report.",
    capabilities: [
      "Real-time pipeline, revenue, and risk metrics in one view",
      "AI-generated Focus Mode — your highest-leverage actions, ranked",
      "Revenue Pulse status (Healthy / Watch / Critical) at a glance",
      "Live escalation count so nothing critical goes unnoticed",
    ],
    howItWorks: [
      "Situs ingests activity from your CRM and connected tools continuously",
      "The intelligence engine scores every deal and recomputes metrics live",
      "Your dashboard reflects the current state — not yesterday's export",
    ],
    stat: { value: "1", label: "screen replaces 5+ spreadsheets" },
  },
  {
    slug: "deals",
    icon: "◎",
    title: "Deals",
    desc: "Track opportunities, progression, and deal health in real time.",
    tagline: "Every deal, scored and explained — not just listed.",
    overview:
      "Deals aren't just rows in a table. Each one carries a live risk score, a plain-English reason for that score, and a recommended next action — so reps know exactly which deals need attention today.",
    capabilities: [
      "Deal-level risk scoring updated as activity happens",
      "Plain-language reasons behind every risk flag",
      "Stage, age, and inactivity tracked automatically",
      "One-click drill-down into full deal history",
    ],
    howItWorks: [
      "Every deal update (stage change, activity, silence) feeds the risk engine",
      "The engine weighs inactivity, stage duration, and deal age",
      "Deals requiring attention surface automatically — no manual review needed",
    ],
    stat: { value: "0", label: "manual risk reviews required" },
  },
  {
    slug: "leads",
    icon: "◐",
    title: "Leads",
    desc: "Manage and prioritize leads with intelligent scoring.",
    tagline: "Know which lead to call first — before you open the list.",
    overview:
      "Not all leads deserve equal attention. Situs scores and ranks leads by conversion likelihood and engagement signal, so your team spends time on the leads most likely to close, not the ones that arrived first.",
    capabilities: [
      "Automatic lead scoring based on engagement and fit",
      "Priority ranking — call the right lead first, every time",
      "Source and activity tracking per lead",
      "Bulk import from CSV, Excel, or connected CRMs",
    ],
    howItWorks: [
      "Leads are imported or synced from your existing tools",
      "The scoring model ranks them by conversion likelihood",
      "Your team works the list top-down instead of guessing",
    ],
    stat: { value: "3x", label: "faster lead triage" },
  },
  {
    slug: "pipeline",
    icon: "◉",
    title: "Pipeline",
    desc: "Understand bottlenecks, flow, and stage velocity.",
    tagline: "See exactly where deals get stuck — and why.",
    overview:
      "Pipeline Health visualizes revenue distribution across every stage and flags leaks before they become lost quarters. Instead of asking 'why did we miss forecast,' you'll already know which stage is the bottleneck.",
    capabilities: [
      "Stage-by-stage revenue distribution, visualized",
      "Automatic bottleneck and leak detection",
      "Stage velocity tracked against your historical baseline",
      "Currency-aware reporting across INR, USD, EUR, GBP",
    ],
    howItWorks: [
      "Every deal's stage and time-in-stage is tracked continuously",
      "The pipeline engine compares velocity against expected norms",
      "Stages accumulating deals abnormally get flagged as leaks",
    ],
    stat: { value: "84%", label: "forecast accuracy achieved" },
  },
  {
    slug: "forecasting",
    icon: "◍",
    title: "Forecasting",
    desc: "Predict future revenue performance with confidence.",
    tagline: "A forecast you can defend in the boardroom.",
    overview:
      "Revenue Forecast combines deal-level risk, historical close rates, and pipeline coverage into a single confidence-scored prediction — with the reasoning behind it, not just a number.",
    capabilities: [
      "AI-predicted expected revenue for the current period",
      "Confidence scoring (Strong / Moderate / Low) with visual gauge",
      "Deals-likely-to-close count, updated daily",
      "Period-over-period comparison built in",
    ],
    howItWorks: [
      "The forecast engine weighs every open deal by risk and stage",
      "Historical win rates calibrate the prediction",
      "Confidence score reflects how much the signal can be trusted",
    ],
    stat: { value: "85%", label: "typical forecast confidence" },
  },
  {
    slug: "alerts",
    icon: "△",
    title: "Alerts",
    desc: "Stay informed the moment something important changes.",
    tagline: "Know the moment a deal goes quiet — not next week.",
    overview:
      "Alerts fire the instant a tracked signal crosses a threshold — a deal goes silent, risk spikes, or forecast confidence drops. Delivered in-app, by email, or straight to Slack.",
    capabilities: [
      "Deal risk, pipeline, and forecast alert categories",
      "Configurable sensitivity — Conservative, Balanced, Aggressive",
      "Slack and email delivery, not just an in-app badge",
      "Toggle each alert type independently in Settings",
    ],
    howItWorks: [
      "You set your sensitivity level once in Settings",
      "The signal engine monitors every deal continuously",
      "Crossed thresholds trigger an alert to your chosen channel instantly",
    ],
    stat: { value: "24/7", label: "continuous monitoring" },
  },
  {
    slug: "analytics",
    icon: "⬡",
    title: "Analytics",
    desc: "Deep performance tracking and trend analysis.",
    tagline: "Trends you'd otherwise only notice in hindsight.",
    overview:
      "Analytics surfaces the patterns hiding in your revenue data — win-rate trends, rep performance, deal-size shifts — so you catch a slowdown while there's still time to act on it.",
    capabilities: [
      "Win-rate and deal-size trend tracking over time",
      "Team and individual rep performance breakdowns",
      "Exportable reports for leadership reviews",
      "Historical comparisons across any custom period",
    ],
    howItWorks: [
      "Every closed and lost deal is logged with full context",
      "The analytics layer aggregates trends across time windows",
      "Reports update automatically — no manual pivot tables",
    ],
    stat: { value: "∞", label: "revenue signals tracked" },
  },
  {
    slug: "ai-intelligence",
    icon: "✦",
    title: "AI Intelligence",
    desc: "Actionable insights and recommendations powered by AI.",
    tagline: "Not another dashboard. A reason to act.",
    overview:
      "This is the layer that ties everything together — reading risk, pipeline, and forecast signals to generate a ranked list of the highest-leverage actions your team can take right now, with the reasoning behind each one.",
    capabilities: [
      "Ranked, prioritized action recommendations (Focus Mode)",
      "Plain-English reasoning behind every recommendation",
      "Critical / Watch / Opportunity classification",
      "Continuously re-ranked as new signals arrive",
    ],
    howItWorks: [
      "Signals from Deals, Pipeline, and Forecasting feed one engine",
      "Actions are scored by urgency and potential revenue impact",
      "The top 3-5 actions surface in Focus Mode — no digging required",
    ],
    stat: { value: "6", label: "AI actions recommended, on average" },
  },
];

export function getFeatureBySlug(slug: string): FeatureDetail | undefined {
  return FEATURE_DETAILS.find((f) => f.slug === slug);
}