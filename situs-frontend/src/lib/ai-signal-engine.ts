export type DealData = {
  id: string;
  name: string;
  stage: string;
  lastActivityDays: number;
  daysInStage: number;
  closeDateDays: number;
};

export type AISignal = {
  id: string;
  type: "risk";
  priority: "critical" | "watch" | "normal";
  title: string;
  insight: string;
  reason: string;
  action: string;
  timestamp: number;
};

export function generateAISignals(deals: DealData[]): AISignal[] {

  const signals: AISignal[] = [];

  deals.forEach((deal) => {

    /* Deal Inactivity */

    if (deal.lastActivityDays > 7) {

      signals.push({
        id: `${deal.id}-inactive`,
        type: "risk",
        priority: "watch",
        title: "Deal inactive",
        insight: `${deal.name} has no activity for ${deal.lastActivityDays} days.`,
        reason: "Lack of customer engagement detected.",
        action: "Schedule follow-up meeting or send check-in email.",
        timestamp: Date.now()
      });

    }

    /* Stage Stagnation */

    if (deal.daysInStage > 14) {

      signals.push({
        id: `${deal.id}-stalled`,
        type: "risk",
        priority: "watch",
        title: "Stage stalled",
        insight: `${deal.name} has been in ${deal.stage} stage for ${deal.daysInStage} days.`,
        reason: "Deal progression appears to be slowing.",
        action: "Review deal blockers and confirm next step with customer.",
        timestamp: Date.now()
      });

    }

    /* Unrealistic Close Date */

    if (deal.closeDateDays < 10 && deal.stage !== "Closing") {

      signals.push({
        id: `${deal.id}-close-risk`,
        type: "risk",
        priority: "critical",
        title: "Close date risk",
        insight: `${deal.name} close date is approaching but deal is still in ${deal.stage}.`,
        reason: "Pipeline timing appears unrealistic.",
        action: "Re-evaluate timeline or accelerate deal progression.",
        timestamp: Date.now()
      });

    }

  });

  return signals;

}