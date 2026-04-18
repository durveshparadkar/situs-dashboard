export const getForecast = async () => {
  const res = await fetch("/api/forecast", {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch forecast");
  }

  return res.json();
};