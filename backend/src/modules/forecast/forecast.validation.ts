export const validateForecastQuery = (query: any) => {
  const { range } = query;

  const allowedRanges = ["7d", "30d", "90d"];

  if (range && !allowedRanges.includes(range)) {
    throw new Error("Invalid forecast range");
  }
};