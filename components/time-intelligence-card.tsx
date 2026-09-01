"use client";

import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { HourlyData } from "@/actions/analytics";

export function TimeIntelligenceCard({ data }: { data: HourlyData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="co-card" style={{ height: 250, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        No Data Available
      </div>
    );
  }

  return (
    <div className="co-card" style={{ padding: 24, width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: "bold", margin: 0, color: "var(--text-primary)" }}>Hourly Financial Matrix 📊</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
          Realized Sales (Bars) vs Leakage Risk (Line)
        </p>
      </div>
      
      <div style={{ height: 300, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
            <XAxis 
              dataKey="timeLabel" 
              tick={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} 
              tickLine={false} 
              axisLine={false} 
            />
            <YAxis 
              tick={{ fontSize: 10, fill: "var(--text-secondary)", fontWeight: 600 }} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(val) => `₹${val}`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
              itemStyle={{ fontSize: 12, fontWeight: "bold" }}
              formatter={(value: any) => `₹${Number(value).toFixed(0)}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: "bold", paddingTop: 10 }} />
            
            <Bar dataKey="hourlyUpi" stackId="a" fill="#3B82F6" name="UPI" barSize={16} />
            <Bar dataKey="hourlyCash" stackId="a" fill="var(--success)" name="Cash" radius={[4, 4, 0, 0]} />
            <Line 
              type="monotone" 
              dataKey="hourlyLeakage" 
              stroke="var(--danger)" 
              strokeWidth={3} 
              dot={{ r: 4, fill: "var(--danger)" }} 
              name="Leakage Risk" 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}