import { getBoard } from "@/app/actions/boards"
import { BoardPreviewCanvas } from "@/components/whiteboard/board-preview-canvas"
import { SiteThemeProvider } from "@/components/site-theme"
import { notFound } from "next/navigation"

// A chrome-less, read-only render of a board, embedded via <iframe> on the
// boards grid so each card shows the real canvas (not a lossy re-drawing).
// Same-origin iframe means it shares localStorage with the parent page, so
// wrapping it in SiteThemeProvider picks up the viewer's own light/dark
// preference — the thumbnail matches what opening the board would look like.
export default async function BoardPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const board = await getBoard(id)
  if (!board) notFound()
  return (
    <SiteThemeProvider>
      <main className="h-dvh w-dvw overflow-hidden bg-background">
        <BoardPreviewCanvas board={board} />
      </main>
    </SiteThemeProvider>
  )
}
