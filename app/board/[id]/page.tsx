import { getBoard } from "@/app/actions/boards"
import { BoardEditor } from "@/components/whiteboard/board-editor"
import { notFound } from "next/navigation"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const board = await getBoard(id)
  if (!board) notFound()
  return <BoardEditor board={board} />
}
