import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";

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

  let status = "Pending";
  if (plan.confirmed) status = "Confirmed";
  if (fulfilled > 0 && fulfilled < planned) status = "Partially Fulfilled";
  if (fulfilled >= planned && planned > 0) status = "Fulfilled";

  const updated = await updateRecord(
    "productionPlans",
    id,
    { fulfilledQty: fulfilled, unfulfilledQty: Math.max(0, planned - fulfilled), status },
    user
  );

  return NextResponse.json({ data: updated });
}
