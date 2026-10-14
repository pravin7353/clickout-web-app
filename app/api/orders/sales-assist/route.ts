import { NextRequest, NextResponse } from "next/server";
import { updateSalesExecMonthlyStats } from "@/actions/hr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, assistedByEmpId, orderAmount, orderId, month } = body;

    if (!tenantId || !assistedByEmpId || typeof orderAmount !== "number") {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: tenantId, assistedByEmpId, orderAmount" },
        { status: 400 }
      );
    }

    const result = await updateSalesExecMonthlyStats({
      tenantId,
      assistedByEmpId,
      orderAmount: Number(orderAmount),
      orderId,
      month,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to update sales executive stats" },
      { status: 500 }
    );
  }
}
