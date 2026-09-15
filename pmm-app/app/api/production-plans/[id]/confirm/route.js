import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";

export async function POST(req, { params }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { user } = body;

  const plan = await getRecord("productionPlans", id);
  if (!plan) return NextResponse.json({ error: "Production plan tidak ditemukan" }, { status: 404 });
  if (plan.confirmed) return NextResponse.json({ error: "Production plan sudah confirmed" }, { status: 400 });

  const totalCost = (plan.cogs || 0) * (plan.plannedQty || 0);
  const updated = await updateRecord(
    "productionPlans",
    id,
    {
      confirmed: true,
      confirmedCOGS: plan.cogs,
      totalProductionCost: totalCost,
      status: "Confirmed",
    },
    user
  );

  return NextResponse.json({ data: updated });
}
