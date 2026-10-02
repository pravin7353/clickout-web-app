export default function EmployeeLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Banner Skeleton */}
      <div
        style={{
          height: 140,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Today's Card Skeleton */}
      <div
        style={{
          height: 190,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Holidays Skeleton */}
      <div
        style={{
          height: 90,
          borderRadius: 20,
          background: "linear-gradient(90deg, rgba(203, 213, 225, 0.2) 25%, rgba(203, 213, 225, 0.4) 50%, rgba(203, 213, 225, 0.2) 75%)",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}
