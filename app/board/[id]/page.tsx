import { getBoard } from "@/app/actions/boards"
import { BoardEditor } from "@/components/whiteboard/board-editor"
import { notFound } from "next/navigation"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Distinguish "no such board" (real 404) from "the DB fetch failed" — the
  // latter still renders the editor, which falls back to the local recovery
  // draft (or a "couldn't load" state if there isn't one).
  let board
  try {
    board = await getBoard(id)
  } catch {
    return <BoardEditor board={null} boardId={id} />
  }

  if (!board) notFound()
  return <BoardEditor board={board} boardId={id} />
}
