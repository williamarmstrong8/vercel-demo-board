import { getBoard } from "@/app/actions/boards"
import { getCurrentUser } from "@/lib/auth/current-user"
import { BoardEditor } from "@/components/whiteboard/board-editor"
import { notFound, redirect } from "next/navigation"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Board access is owner-scoped; require a session before touching it.
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const board = await getBoard(id)
  if (!board) notFound()
  return <BoardEditor board={board} />
}
