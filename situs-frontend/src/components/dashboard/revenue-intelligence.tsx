"use client";

import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

type SignalLevel = "critical" | "watch" | "positive";

type Insight = {
  title: string;
  description: string;
  action: string;
  level: SignalLevel;
};

const insights: Insight[] = [
  {
    title: "High Risk Deal",
    description: "Acme Corp inactive for 9 days in Negotiation stage.",
    action: "Re-engage buyer and review deal activity.",
    level: "critical"
  },
  {
    title: "Pipeline Leak",
    description: "$420K stuck in Negotiation stage for over 14 days.",
    action: "Escalate deals to leadership for acceleration.",
    level: "watch"
  },
  {
    title: "Conversion Momentum",
    description: "Demo → Proposal conversion improved by 18%.",
    action: "Increase demo scheduling to capitalize on momentum.",
    level: "positive"
  }
];

export default function RevenueIntelligence() {
  return (
    <div className="space-y-5">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {insights.map((insight, index) => {

          const styles = getStyles(insight.level);
          const Icon = styles.icon;

          return (
            <div
              key={index}
              className={`
              group relative
              bg-white
              border
              rounded-xl
              p-5
              shadow-sm
              hover:shadow-lg
              transition-all duration-200
              hover:-translate-y-0.5
              cursor-default
              `}
            >

              {/* Accent bar */}
              <div
                className={'absolute left-0 top-0 h-full w-0.75 rounded-l-xl ' + styles.accent}
              />

              <div className="flex items-start gap-4">

                {/* Icon */}
                <div
                  className={`
                  flex items-center justify-center
                  w-10 h-10 rounded-lg
                  ${styles.iconBg}
                  transition-transform
                  group-hover:scale-110
                  `}
                >
                  <Icon size={18} className={styles.iconColor} />
                </div>

                {/* Content */}
                <div className="flex-1 space-y-2">

                  <h3 className="text-sm font-semibold text-slate-900">
                    {insight.title}
                  </h3>

                  <p className="text-sm text-slate-500 leading-relaxed">
                    {insight.description}
                  </p>

                  <p className="text-xs font-medium text-slate-700 pt-1">
                    → {insight.action}
                  </p>

                </div>

              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

function getStyles(level: SignalLevel) {
  if (level === "critical") {
    return {
      icon: AlertTriangle,
      accent: "bg-red-500",
      iconBg: "bg-red-50",
      iconColor: "text-red-500"
    };
  }

  if (level === "watch") {
    return {
      icon: TrendingDown,
      accent: "bg-amber-500",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600"
    };
  }

  return {
    icon: TrendingUp,
    accent: "bg-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600"
  };
}