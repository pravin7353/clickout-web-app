"use client";

import Link from "next/link";

interface EmployeeHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    photoUrl?: string | null;
  };
}

export function EmployeeHeader({ user }: EmployeeHeaderProps) {
  const displayName = user?.name || user?.email || "Employee";
  const firstName = displayName.split(" ")[0] || "E";
  const initials = firstName.charAt(0).toUpperCase();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "var(--card-bg, #ffffff)",
        borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: Text only ClickOut logo in #22c55e, bold */}
        <Link
          href="/employee"
          style={{
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#22c55e",
              letterSpacing: "-0.03em",
            }}
          >
            ClickOut
          </span>
        </Link>

        {/* Right: Employee initials avatar */}
        <Link
          href="/employee/profile"
          title="View Profile"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(34, 197, 94, 0.25)",
            }}
          >
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
