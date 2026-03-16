import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth");
  }

  return (
    <DashboardShell
      user={{
        name: session.user.name || "User",
        email: session.user.email || "",
        role: (session.user as { role?: string }).role || "MEMBER",
        avatar: (session.user as { avatar?: string }).avatar || null,
      }}
    >
      {children}
    </DashboardShell>
  );
}
