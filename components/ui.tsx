export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`co-card ${className ?? ""}`} style={style}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>{title}</h1>
        {subtitle && <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6 }}>{subtitle}</p>}
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
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`co-btn co-btn-${variant}`} style={style}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...rest } = props;
  return <input {...rest} className={`co-input ${className ?? ""}`} style={style} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, style, ...rest } = props;
  return <select {...rest} className={`co-input ${className ?? ""}`} style={style} />;
}

export function Badge({ children, color = "var(--text-secondary)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="co-badge" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      {children}
    </span>
  );
}

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 15, height: 15, borderRadius: "50%", border: "1px solid var(--text-secondary)",
        color: "var(--text-secondary)", fontSize: 10, fontStyle: "italic", fontFamily: "serif",
        marginLeft: 6, cursor: "help", flexShrink: 0,
      }}
    >
      i
    </span>
  );
}

export function EmptyState({ message, icon = "📭" }: { message: string; icon?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-secondary)" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      {message}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      🚨 {message}
    </div>
  );
}

export function SkeletonRow({ height = 44 }: { height?: number }) {
  return <div className="co-skeleton" style={{ height, marginBottom: 8, opacity: 0.6 }} />;
}

export function SkeletonBlock({ height = 100, width = "100%" }: { height?: number; width?: number | string }) {
  return <div className="co-skeleton" style={{ height, width, opacity: 0.6 }} />;
}