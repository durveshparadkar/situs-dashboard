import Deal from "../deals/deal.model.js";

class ForecastService {
  async getForecast(orgId: string, range: string = "30d") {
    /* ===============================
       SECURITY CHECK
    =============================== */
    if (!orgId) throw new Error("Unauthorized");

    /* ===============================
       FETCH DEALS
    =============================== */
    const deals = await Deal.find({
      organizationId: orgId,
      isArchived: false,
    }).lean();

    let totalValue = 0;
    let weightedValue = 0;
    let highConfidenceValue = 0;

    let dealCount = deals.length;
    let closingDeals = 0;

    /* ===============================
       CORE CALCULATION
    =============================== */
    for (const deal of deals) {
      const value = deal.value || 0;
      const probability = deal.probability || 0;

      totalValue += value;

      // 🎯 weighted forecast
      const weighted = (value * probability) / 100;
      weightedValue += weighted;

      // 🔥 high confidence bucket
      if (probability >= 70) {
        highConfidenceValue += value;
        closingDeals++;
      }
    }

    /* ===============================
       METRICS
    =============================== */
    const conversionRate =
      dealCount > 0 ? (closingDeals / dealCount) * 100 : 0;

    const pipelineHealth =
      weightedValue / (totalValue || 1);

    /* ===============================
       RESPONSE
    =============================== */
    return {
      summary: {
        totalPipelineValue: Math.round(totalValue),
        weightedForecast: Math.round(weightedValue),
        highConfidenceRevenue: Math.round(highConfidenceValue),
      },

      metrics: {
        dealCount,
        conversionRate: Math.round(conversionRate),
        pipelineHealth: Number(pipelineHealth.toFixed(2)),
      },

      insights: this.generateInsights({
        conversionRate,
        pipelineHealth,
        weightedValue,
        totalValue,
      }),
    };
  }

  /* ===============================
     🧠 INSIGHTS ENGINE (🔥 IMPORTANT)
  =============================== */
  generateInsights(data: any) {
    const insights: string[] = [];

    if (data.pipelineHealth < 0.4) {
      insights.push("Pipeline health is low — deals lack confidence");
    }

    if (data.conversionRate < 30) {
      insights.push("Conversion rate is below average");
    }

    if (data.weightedValue < data.totalValue * 0.3) {
      insights.push("Revenue forecast is weak compared to pipeline");
    }

    if (insights.length === 0) {
      insights.push("Forecast looks strong");
    }

    return insights;
  }
}

export default new ForecastService();