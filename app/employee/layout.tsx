import { auth } from "@/lib/auth";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { EmployeeBottomNav } from "@/components/employee/employee-bottom-nav";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    return <>{children}</>;
  }

  const user = session.user as any;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #f8fafc)",
        color: "var(--text-primary, #0f172a)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* Mobile-first centered frame container (max 430px) */}
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg, #f8fafc)",
          boxShadow: "0 0 40px rgba(0, 0, 0, 0.08)",
          position: "relative",
        }}
      >
        <EmployeeHeader user={user} />

        <main
          style={{
            flex: 1,
            width: "100%",
            padding: "16px 16px 88px 16px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </main>

        <EmployeeBottomNav />
      </div>
    </div>
  );
}
