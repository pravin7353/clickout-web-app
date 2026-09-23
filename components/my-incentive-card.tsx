"use client";

import { useState, useEffect } from "react";
import { Card, Badge, SkeletonRow } from "@/components/ui";
import { getMyIncentive } from "@/actions/incentive";

interface MyIncentiveCardProps {
  staffId: string;
  role: string;
}

export function MyIncentiveCard({ staffId, role }: MyIncentiveCardProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!staffId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await getMyIncentive(staffId, currentMonthStr);
        if (isMounted) {
          if (res.ok && res.incentive) {
            setData(res.incentive);
          } else {
            setErrorMsg(res.error || "Unable to fetch incentive data.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || "Unable to load incentive.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [staffId, currentMonthStr]);

  const isCashier = role.toLowerCase() === "cashier";
  const isGuard = role.toLowerCase() === "guard";

  if (!isCashier && !isGuard) {
    return null;
  }

  const currentMonthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <Card
      style={{
        padding: 16,
        borderRadius: 16,
        border: "1px solid color-mix(in srgb, var(--cta-bg, #F9A826) 35%, var(--border))",
        background: "color-mix(in srgb, var(--card-bg) 92%, var(--scaffold-bg))",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏆</span>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
              My Incentive • {currentMonthName}
            </h3>
            <Badge color="var(--cta-bg, #F9A826)">Live Performance</Badge>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            {isCashier
              ? "Performance bonus earned from assisted checkouts and scanned volumes."
              : "Security reward for gate discrepancy intercepts and high-risk catches."}
          </p>
        </div>

        <div>
          {loading ? (
            <div style={{ width: 120 }}>
              <SkeletonRow height={28} />
            </div>
          ) : errorMsg ? (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>{errorMsg}</span>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>
                ESTIMATED BONUS
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#22c55e" }}>
                ₹{(data?.incentiveAmount ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
          )}
        </div>
      </div>

      {!loading && data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          {isCashier && (
            <>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Orders Processed</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                  {data.ordersProcessed ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Processed Volume</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                  ₹{(data.totalValue ?? 0).toLocaleString("en-IN")}
                </div>
              </div>
            </>
          )}

          {isGuard && (
            <>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Fraud Catches</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>
                  {data.fraudCatches ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Value Prevented</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                  ₹{(data.fraudValuePrevented ?? 0).toLocaleString("en-IN")}
                </div>
              </div>
            </>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Applied Incentive Rules</div>
            <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2 }}>
              {data.appliedRules && data.appliedRules.length > 0 ? (
                data.appliedRules.map((rule: string, i: number) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      background: "color-mix(in srgb, #22c55e 12%, transparent)",
                      color: "#22c55e",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      marginRight: 6,
                      marginTop: 2,
                    }}
                  >
                    ✓ {rule}
                  </span>
                ))
              ) : (
                <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Standard tier calculation active.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
