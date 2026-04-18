"use client";

import { Card, CardContent } from "../ui/card";

interface InsightCardProps {
  title: string;
  description: string;
  type?: "risk" | "opportunity" | "info";
  signal?: string;
}

export default function InsightCard({
  title,
  description,
  type = "info",
  signal
}: InsightCardProps) {

  const styles = {
    risk: {
      accent: "border-red-500",
      title: "text-red-600"
    },
    opportunity: {
      accent: "border-emerald-500",
      title: "text-emerald-600"
    },
    info: {
      accent: "border-blue-500",
      title: "text-blue-600"
    }
  };

  const current = styles[type];

  return (
    <Card
      className={`
        bg-white
        border border-slate-200
        border-l-4
        ${current.accent}
        shadow-sm
        transition-all
        duration-200
        ease-out
        hover:-translate-y-[2px]
        hover:shadow-md
      `}
    >
      <CardContent className="p-6">

        <div className="flex flex-col">

          {/* Insight Title */}
          <h3 className={'text-sm font-semibold mb-1 ' + current.title}>
            {title}
          </h3>

          {/* Insight Description */}
          <p className="text-sm text-slate-600 leading-relaxed">
            {description}
          </p>

          {/* Optional AI signal */}
          {signal && (
            <p className="text-xs text-slate-500 mt-2">
              {signal}
            </p>
          )}

        </div>

      </CardContent>
    </Card>
  );
}