export type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
};

export type PipelineLeak = {
  stage: string;
  totalValue: number;
  dealCount: number;
  message: string;
};

export function detectPipelineLeaks(deals: Deal[]): PipelineLeak[] {

  const stageMap: Record<string, { value: number; count: number; inactivity: number }> = {};

  for (const deal of deals) {

    if (!stageMap[deal.stage]) {
      stageMap[deal.stage] = { value: 0, count: 0, inactivity: 0 };
    }

    stageMap[deal.stage].value += deal.value;
    stageMap[deal.stage].count += 1;

    /* Added intelligence: track inactivity */
    stageMap[deal.stage].inactivity += deal.lastActivityDays;
  }

  const leaks: PipelineLeak[] = [];

  for (const stage in stageMap) {

    const data = stageMap[stage];

    const avgInactivity = data.inactivity / data.count;

    if (data.count >= 2 && data.value >= 200000) {

      leaks.push({
        stage,
        totalValue: data.value,
        dealCount: data.count,
        message: `$${Math.round(data.value / 1000)}K stuck in ${stage} stage with ${Math.round(avgInactivity)} days avg inactivity`
      });

    }

  }

  return leaks;
}