// Shared UI primitives — import these instead of writing inline hex colors.
// Change globals.css tokens once, every component using these updates automatically.
// This is the Next.js equivalent of Flutter's app_theme.dart + reusable widgets.

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children, onClick, disabled, type = "button", variant = "primary", style,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  type?: "button" | "submit"; variant?: ButtonVariant; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, border: "none",
  };
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: "var(--cta-bg-accent)", color: "#000" },
    secondary: { background: "var(--card-bg)", color: "var(--text-primary)", border: "1px solid var(--border)" },
    danger: { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" },
    ghost: { background: "transparent", color: "var(--text-secondary)" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: 10, borderRadius: 8, border: "1px solid var(--border)",
        background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 14,
        ...props.style,
      }}
    />
  );
}

export function Badge({ children, color = "var(--text-secondary)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${color}`, color }}>
      {children}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p style={{ color: "var(--text-secondary)", padding: "24px 0", textAlign: "center" }}>{message}</p>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
      🚨 {message}
    </div>
  );
}
