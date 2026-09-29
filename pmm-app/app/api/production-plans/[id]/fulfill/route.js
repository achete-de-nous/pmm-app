import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";
import { computePlanStatus } from "@/lib/calc";

export async function POST(req, { params }) {
  const { id } = params;
  const body = await req.json();
  const { fulfilledQty, user, allowOverPlanned } = body;

  const plan = await getRecord("productionPlans", id);
  if (!plan) return NextResponse.json({ error: "Production plan tidak ditemukan" }, { status: 404 });

  const planned = Number(plan.plannedQty) || 0;
  const fulfilled = Number(fulfilledQty) || 0;

  if (fulfilled > planned && !allowOverPlanned) {
    return NextResponse.json(
      { error: `Fulfilled (${fulfilled}) melebihi Planned Qty (${planned}). Konfirmasi adjustment untuk melanjutkan.` },
      { status: 400 }
    );
  }

  // Fulfilled Date always tracks the most recent update to Fulfilled Qty.
  const now = new Date().toISOString();
  const draft = { ...plan, fulfilledQty: fulfilled, fulfilledDate: now };
  const status = computePlanStatus(draft);
  const delayDate = status === "Delayed" ? now : plan.delayDate || null;

  const updated = await updateRecord(
    "productionPlans",
    id,
    { fulfilledQty: fulfilled, fulfilledDate: now, status, delayDate },
    user
  );

  return NextResponse.json({ data: updated });
}
