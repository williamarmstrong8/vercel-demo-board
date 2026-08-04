import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/**
 * Current weather for a place.
 *
 * Mirrors the `tools/get_weather.ts` code block shown on the canvas: live data
 * from wttr.in (https://wttr.in/<place>?format=j1), a free service that needs
 * no API key or signup. The path segment is whatever the user named — a city,
 * a zip code, an airport code, or a landmark all resolve.
 *
 * Beyond what the canvas block shows, this adds the playground's plumbing: the
 * capability gate, a request timeout, and deterministic sample data as a
 * fallback so the demo still answers when wttr.in is unreachable.
 */
export default defineTool({
  description: "Get the current weather for a city (live data from wttr.in).",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    if (!isToolEnabled("get_weather")) return disabledResult("get_weather")

    try {
      const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`wttr.in responded ${res.status}`)

      const data = (await res.json()) as WttrResponse
      const now = data.current_condition?.[0]
      if (!now) throw new Error("wttr.in returned no current conditions")

      return {
        city,
        region: data.nearest_area?.[0]?.region?.[0]?.value ?? "",
        // wttr.in pads some descriptions ("Partly Cloudy ")
        condition: now.weatherDesc?.[0]?.value?.trim() ?? "Unknown",
        temperatureC: Number(now.temp_C),
        temperatureF: Number(now.temp_F),
        humidity: Number(now.humidity),
        windKph: Number(now.windspeedKmph),
        source: "wttr.in",
      }
    } catch (err) {
      // Graceful fallback: deterministic sample data keyed off the place name.
      const conditions = ["Sunny", "Partly cloudy", "Cloudy", "Light rain", "Clear"]
      let hash = 0
      for (const ch of city.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
      const temperatureC = 8 + (hash % 22) // 8–29°C
      return {
        city,
        condition: conditions[hash % conditions.length],
        temperatureC,
        temperatureF: Math.round(temperatureC * 1.8 + 32),
        humidity: 40 + (hash % 50),
        windKph: 5 + (hash % 25),
        preview: true,
        source: "sample data — wttr.in was unreachable",
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
    humidity: string
    windspeedKmph: string
    weatherDesc?: Array<{ value: string }>
  }>
  nearest_area?: Array<{
    region?: Array<{ value: string }>
  }>
}
