import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/**
 * Current weather for a city.
 *
 * Fetches live data from wttr.in's JSON endpoint (https://wttr.in/<city>?format=j1).
 * The `~` prefix biases wttr.in's geocoder toward named places, so "san francisco"
 * resolves to San Francisco, CA instead of a same-named village elsewhere.
 * If the request fails (offline sandbox, upstream error), it falls back to
 * deterministic sample data so the playground still works.
 */
export default defineTool({
  description: "Get the current weather for a city (live data from wttr.in).",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    if (!isToolEnabled("get_weather")) return disabledResult("get_weather")

    try {
      const url = `https://wttr.in/~${encodeURIComponent(city)}?format=j1`
      const res = await fetch(url, {
        headers: { "User-Agent": "curl/8", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`wttr.in responded ${res.status}`)

      const data = (await res.json()) as WttrResponse
      const cur = data.current_condition?.[0]
      const area = data.nearest_area?.[0]
      if (!cur) throw new Error("wttr.in returned no current conditions")

      const location = area
        ? [area.areaName?.[0]?.value, area.region?.[0]?.value, area.country?.[0]?.value]
            .filter(Boolean)
            .join(", ")
        : city

      return {
        city,
        location,
        condition: cur.weatherDesc?.[0]?.value ?? "Unknown",
        temperatureC: Number(cur.temp_C),
        temperatureF: Number(cur.temp_F),
        feelsLikeC: Number(cur.FeelsLikeC),
        feelsLikeF: Number(cur.FeelsLikeF),
        humidity: Number(cur.humidity),
        windKph: Number(cur.windspeedKmph),
        source: "wttr.in",
      }
    } catch (err) {
      // Graceful fallback: deterministic sample data keyed off the city name.
      const conditions = ["Sunny", "Partly cloudy", "Cloudy", "Light rain", "Clear"]
      let hash = 0
      for (const ch of city.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
      const condition = conditions[hash % conditions.length]
      const temperatureC = 8 + (hash % 22) // 8–29°C
      return {
        city,
        location: city,
        condition,
        temperatureC,
        temperatureF: Math.round(temperatureC * 1.8 + 32),
        humidity: 40 + (hash % 50),
        windKph: 5 + (hash % 25),
        preview: true,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
})

/** Minimal shape of the fields we read from wttr.in's `format=j1` response. */
interface WttrResponse {
  current_condition?: Array<{
    temp_C: string
    temp_F: string
    FeelsLikeC: string
    FeelsLikeF: string
    humidity: string
    windspeedKmph: string
    weatherDesc?: Array<{ value: string }>
  }>
  nearest_area?: Array<{
    areaName?: Array<{ value: string }>
    region?: Array<{ value: string }>
    country?: Array<{ value: string }>
  }>
}
