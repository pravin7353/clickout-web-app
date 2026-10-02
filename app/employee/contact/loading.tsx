export default function ContactLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title skeleton */}
      <div
        style={{
          width: 160,
          height: 24,
          borderRadius: 8,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* HR Card skeleton */}
      <div
        style={{
          height: 120,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Action button skeleton */}
      <div
        style={{
          height: 48,
          borderRadius: 14,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Queries list skeleton */}
      <div
        style={{
          height: 140,
          borderRadius: 16,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
