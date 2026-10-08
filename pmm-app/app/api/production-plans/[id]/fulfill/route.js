import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";
import { computePlanStatus } from "@/lib/calc";

// Fulfilled Qty updates must keep full history (every update, not just the
// latest value) with an auto-recorded Fulfilled Date each time - per REVISI spec.
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

  const now = new Date().toISOString();
  const oldFulfilledDate = plan.fulfilledDate || null;

  const draft = { ...plan, fulfilledQty: fulfilled, fulfilledDate: now };
  const { status, isDelayed } = computePlanStatus(draft);

  const fulfillHistory = [
    ...(plan.fulfillHistory || []),
    { qty: fulfilled, previousQty: Number(plan.fulfilledQty) || 0, date: now, user: user || "Unknown" },
  ];
  const history = [
    ...(plan.history || []),
    {
      field: "fulfilledDate",
      label: "Fulfilled Date",
      oldValue: oldFulfilledDate,
      newValue: now,
      user: user || "Unknown",
      timestamp: now,
    },
  ];

  const updated = await updateRecord(
    "productionPlans",
    id,
    { fulfilledQty: fulfilled, fulfilledDate: now, status, isDelayed, fulfillHistory, history },
    user
  );

  return NextResponse.json({ data: updated });
}
