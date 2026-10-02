export default function AttendanceLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Month Navigator Skeleton */}
      <div
        style={{
          height: 60,
          borderRadius: 18,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Calendar Grid Skeleton */}
      <div
        style={{
          height: 320,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Legend Skeleton */}
      <div
        style={{
          height: 70,
          borderRadius: 18,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
