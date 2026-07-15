import { getBoard } from "@/app/actions/boards"
import { getCurrentUser } from "@/lib/auth/current-user"
import { BoardPreviewCanvas } from "@/components/whiteboard/board-preview-canvas"
import { notFound } from "next/navigation"

// A chrome-less, read-only render of a board, embedded via <iframe> on the
// boards grid so each card shows the real canvas (not a lossy re-drawing).
export default async function BoardPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Owner-scoped; this route is only ever embedded from the authenticated grid.
  const user = await getCurrentUser()
  if (!user) notFound()
  const board = await getBoard(id)
  if (!board) notFound()
  return (
    <main className="h-dvh w-dvw overflow-hidden bg-white">
      <BoardPreviewCanvas board={board} />
    </main>
  )
}
