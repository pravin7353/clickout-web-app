"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/employee",
    icon: "🏠",
    isActive: (p) => p === "/employee",
  },
  {
    label: "Attendance",
    href: "/employee/attendance",
    icon: "📅",
    isActive: (p) => p.startsWith("/employee/attendance"),
  },
  {
    label: "Profile",
    href: "/employee/profile",
    icon: "👤",
    isActive: (p) => p.startsWith("/employee/profile"),
  },
  {
    label: "Requests",
    href: "/employee/requests",
    icon: "📋",
    isActive: (p) => p.startsWith("/employee/requests"),
  },
  {
    label: "Contact",
    href: "/employee/contact",
    icon: "☎️",
    isActive: (p) => p.startsWith("/employee/contact"),
  },
];

export function EmployeeBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--card-bg, #ffffff)",
        borderTop: "1px solid var(--border, rgba(0,0,0,0.08))",
        boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.06)",
        backdropFilter: "blur(12px)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)",
      }}
    >
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          height: 64,
          alignItems: "center",
          padding: "0 4px",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                textDecoration: "none",
                minHeight: 44,
                minWidth: 44,
                borderRadius: 12,
                color: active ? "#22c55e" : "var(--text-secondary, #64748b)",
                transition: "color 0.15s ease",
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  lineHeight: 1,
                  transform: active ? "scale(1.1)" : "scale(1)",
                  transition: "transform 0.15s ease",
                }}
              >
                {item.icon}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 800 : 600,
                  letterSpacing: "-0.01em",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
