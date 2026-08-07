import { gateway } from "ai"
import { shortlistModels, type BuilderModel } from "@/lib/ai/models"

// Lists the models offered in the board-builder's picker. The catalog is read
// live from the AI Gateway so ids always reflect what will actually work, then
// narrowed by `shortlistModels` to the top providers' three headline models —
// the full catalog is far too long to scroll in a dropdown.
// Authenticated via the same OIDC/Gateway credentials as the generation route.

export const revalidate = 3600 // refresh the catalog hourly

export type { BuilderModel }

export async function GET() {
  try {
    const { models } = await gateway.getAvailableModels()
    const language = models
      .filter((m) => (m.modelType ?? "language") === "language")
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.specification?.provider ?? m.id.split("/")[0],
      }))

    return Response.json({ models: shortlistModels(language) })
  } catch (err) {
    console.error("failed to list gateway models:", err)
    return Response.json(
      { models: [], error: err instanceof Error ? err.message : "Could not load models." },
      { status: 200 },
    )
  }
}
