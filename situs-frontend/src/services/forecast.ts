import { apiFetch } from "@/lib/api";

export const getForecast = async () => {
  return apiFetch("/api/forecast");
};
