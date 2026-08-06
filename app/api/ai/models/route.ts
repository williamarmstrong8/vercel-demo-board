import { gateway } from "ai"

// Lists the language models currently available through the AI Gateway so the
// board-builder's model picker always reflects what will actually work — rather
// than a hardcoded list that drifts out of date. Authenticated via the same
// OIDC/Gateway credentials as the generation route.

export const revalidate = 3600 // refresh the catalog hourly

export interface BuilderModel {
  id: string
  name: string
  provider: string
}

export async function GET() {
  try {
    const { models } = await gateway.getAvailableModels()
    const language: BuilderModel[] = models
      .filter((m) => (m.modelType ?? "language") === "language")
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.specification?.provider ?? m.id.split("/")[0],
      }))
      // Group by provider, then alphabetical, for a tidy dropdown.
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))

    return Response.json({ models: language })
  } catch (err) {
    console.error("failed to list gateway models:", err)
    return Response.json(
      { models: [], error: err instanceof Error ? err.message : "Could not load models." },
      { status: 200 },
    )
  }
}
