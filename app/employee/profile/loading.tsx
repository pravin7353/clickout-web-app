export default function ProfileLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Avatar Header Skeleton */}
      <div
        style={{
          height: 180,
          borderRadius: 24,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Grid Skeleton */}
      <div
        style={{
          height: 160,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Device Info Skeleton */}
      <div
        style={{
          height: 70,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
