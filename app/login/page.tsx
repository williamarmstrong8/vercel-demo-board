import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/current-user"
import { AuthForm } from "@/components/auth-form"

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect("/")

  return (
    <main className="light flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <AuthForm />
    </main>
  )
}
