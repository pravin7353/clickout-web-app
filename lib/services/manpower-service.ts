import { adminDb } from "@/lib/firebase-admin";

const ORDERS_PER_CASHIER_PER_DAY = 160;
const ORDERS_PER_GUARD_PER_DAY = 400;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ForecastResult = {
  hasSufficientData: boolean;
  sampleCount: number;
  period: string;
  expectedOrders: number;
  ordersLowerBound: number;
  ordersUpperBound: number;
  expectedRevenue: number;
  revenueLowerBound: number;
  revenueUpperBound: number;
  cashiersRequired: number;
  guardsRequired: number;
  backupStaffRequired: number;
  rushLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  contributingFactors: string[];
  recommendation: string;
  comparisonPeriod: string;
};

function getEventMultiplier(today: Date): { multiplier: number; eventName: string | null; isSalaryWeek: boolean } {
  const isSalaryWeek = today.getDate() >= 1 && today.getDate() <= 5;
  let multiplier = 1.0;
  let eventName: string | null = null;

  if (today.getMonth() === 9 && today.getDate() === 31) { // October 31 = Diwali Eve placeholder
    eventName = "Diwali Eve";
    multiplier = 1.35;
  } else if (today.getDay() === 0 || today.getDay() === 6) {
    multiplier = 1.15; // weekend bump
  }
  if (isSalaryWeek) multiplier *= 1.15;

  return { multiplier, eventName, isSalaryWeek };
}

export async function getStaffingForecast(tenantId: string | null, branchCode: string | null): Promise<ForecastResult> {
  const today = new Date();
  const weekdayName = WEEKDAY_NAMES[(today.getDay() + 6) % 7]; // Mon=0..Sun=6

  if (!tenantId) {
    return insufficientData(weekdayName, 0);
  }

  const since = new Date(today.getTime() - 84 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().slice(0, 10);

  let query: FirebaseFirestore.Query = adminDb.collection("daily_store_stats")
    .where("tenantId", "==", tenantId)
    .where("date", ">=", sinceStr)
    .orderBy("date", "desc");
  if (branchCode) query = query.where("branchCode", "==", branchCode);

  const snap = await query.get();
  const history = snap.docs.map((d) => d.data());

  const sameWeekday = history
    .filter((d) => {
      const parsed = new Date(d.date);
      return !isNaN(parsed.getTime()) && (parsed.getDay() + 6) % 7 === (today.getDay() + 6) % 7;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const MIN_SAMPLES = 3;
  if (sameWeekday.length < MIN_SAMPLES) {
    return insufficientData(weekdayName, sameWeekday.length);
  }

  const samples = sameWeekday.length > 8 ? sameWeekday.slice(-8) : sameWeekday;

  let weightSum = 0, ordersWeighted = 0, revenueWeighted = 0;
  const orderValues: number[] = [];
  samples.forEach((s, i) => {
    const w = i + 1;
    const orders = s.totalOrders ?? 0;
    const revenue = s.totalRevenue ?? 0;
    orderValues.push(orders);
    ordersWeighted += orders * w;
    revenueWeighted += revenue * w;
    weightSum += w;
  });
  const avgOrders = ordersWeighted / weightSum;
  const avgRevenue = revenueWeighted / weightSum;

  const mean = orderValues.reduce((a, b) => a + b, 0) / orderValues.length;
  const variance = mean === 0 ? 0 : orderValues.reduce((a, v) => a + (v - mean) ** 2, 0) / orderValues.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0.3;

  let trendFactor = 1.0;
  const last14 = history.filter((d) => { const p = new Date(d.date); const diff = (today.getTime() - p.getTime()) / 86400000; return diff <= 14; });
  const prev14 = history.filter((d) => { const p = new Date(d.date); const diff = (today.getTime() - p.getTime()) / 86400000; return diff > 14 && diff <= 28; });
  if (last14.length > 0 && prev14.length > 0) {
    const last14Avg = last14.reduce((a, d) => a + (d.totalOrders ?? 0), 0) / last14.length;
    const prev14Avg = prev14.reduce((a, d) => a + (d.totalOrders ?? 0), 0) / prev14.length;
    if (prev14Avg > 0) trendFactor = Math.min(1.25, Math.max(0.75, last14Avg / prev14Avg));
  }

  const event = getEventMultiplier(today);
  const finalMultiplier = trendFactor * event.multiplier;

  const predictedOrders = Math.round(avgOrders * finalMultiplier);
  const predictedRevenue = avgRevenue * finalMultiplier;

  const spread = Math.min(0.35, Math.max(0.08, cv));
  const ordersLower = Math.round(predictedOrders * (1 - spread));
  const ordersUpper = Math.round(predictedOrders * (1 + spread));
  const revenueLower = predictedRevenue * (1 - spread);
  const revenueUpper = predictedRevenue * (1 + spread);

  const confidence = Math.min(92, Math.max(30, Math.round(100 - cv * 120 - Math.max(0, (8 - samples.length) * 6))));

  let cashiers = Math.max(1, Math.ceil(predictedOrders / ORDERS_PER_CASHIER_PER_DAY));
  let guards = Math.max(1, Math.ceil(predictedOrders / ORDERS_PER_GUARD_PER_DAY));
  const backupStaffRequired = ordersUpper > predictedOrders * 1.15 ? 1 : 0;

  let rushLevel: ForecastResult["rushLevel"] = "LOW";
  if (predictedOrders >= 500) { rushLevel = "CRITICAL"; cashiers += 2; guards += 1; }
  else if (predictedOrders >= 250) { rushLevel = "HIGH"; cashiers += 1; }
  else if (predictedOrders >= 100) { rushLevel = "MEDIUM"; }

  const trendPct = ((trendFactor - 1) * 100).toFixed(0);
  const factors: string[] = [
    `Last ${samples.length} ${weekdayName}${samples.length > 1 ? "s" : ""} averaged ${Math.round(avgOrders)} orders (range ${Math.round(Math.min(...orderValues))}-${Math.round(Math.max(...orderValues))}).`,
  ];
  if (last14.length > 0 && prev14.length > 0) {
    factors.push(`Recent 14-day trend vs previous 14 days: ${trendPct.startsWith("-") ? "" : "+"}${trendPct}%.`);
  }
  if (event.eventName) factors.push(`EVENT DETECTED: ${event.eventName} is expected to drive higher traffic.`);
  if (event.isSalaryWeek) factors.push("SALARY PERIOD: Traffic historically increases during early-month salary weeks.");
  if (backupStaffRequired > 0) factors.push(`Upper-bound estimate (${ordersUpper} orders) is notably above expected — spike risk flagged.`);

  let recommendation =
    rushLevel === "CRITICAL" ? `CRITICAL: Predicted rush based on history. Deploy maximum counters for ${weekdayName}.` :
    rushLevel === "HIGH" ? `HIGH TRAFFIC EXPECTED: Deploy backup cashiers proactively for ${weekdayName}.` :
    rushLevel === "MEDIUM" ? "MODERATE: Standard deployment with 1 backup cashier on standby." :
    `NOMINAL: Historical pattern shows steady, low traffic for ${weekdayName}.`;
  if (event.multiplier > 1.1) recommendation = "EVENT ALERT: " + recommendation;

  return {
    hasSufficientData: true, sampleCount: samples.length, period: weekdayName,
    expectedOrders: predictedOrders, ordersLowerBound: ordersLower, ordersUpperBound: ordersUpper,
    expectedRevenue: predictedRevenue, revenueLowerBound: revenueLower, revenueUpperBound: revenueUpper,
    cashiersRequired: cashiers, guardsRequired: guards, backupStaffRequired, rushLevel, confidence,
    contributingFactors: factors, recommendation,
    comparisonPeriod: `vs last ${samples.length} ${weekdayName}${samples.length > 1 ? "s" : ""}`,
  };
}

function insufficientData(period: string, sampleCount: number): ForecastResult {
  return {
    hasSufficientData: false, sampleCount, period,
    expectedOrders: 0, ordersLowerBound: 0, ordersUpperBound: 0,
    expectedRevenue: 0, revenueLowerBound: 0, revenueUpperBound: 0,
    cashiersRequired: 1, guardsRequired: 1, backupStaffRequired: 0, rushLevel: "LOW", confidence: 0,
    contributingFactors: [`Only ${sampleCount} historical sample(s) found — need at least 3 same-weekday days of data.`],
    recommendation: "Not enough historical data yet to forecast. Check back after a few more weeks of operation.",
    comparisonPeriod: "insufficient data",
  };
}