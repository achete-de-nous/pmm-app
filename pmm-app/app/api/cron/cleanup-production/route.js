import { NextResponse } from "next/server";
import { listRecords, softDeleteRecord } from "@/lib/store";

const RETENTION_MONTHS = 3;

function isOlderThan(dateStr, months) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d < cutoff;
}

// Runs daily via Vercel Cron (see vercel.json). Deletes Production Plans whose
// WIP Date is older than RETENTION_MONTHS - but only when nothing else still
// references that plan (Defect Qty / Finance store their own denormalized
// snapshot of article/batch/vendor/cogs, so they stay readable even after the
// source Production Plan row is gone; a plan is only auto-deleted once it has
// no such reference left pointing at it).
export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [plans, defects, finance] = await Promise.all([
    listRecords("productionPlans"),
    listRecords("defectRecords"),
    listRecords("financeRecords"),
  ]);

  const referencedPlanIds = new Set([...defects.map((d) => d.planId), ...finance.map((f) => f.batchId)]);

  let deleted = 0;
  for (const p of plans) {
    if (!isOlderThan(p.wipDate, RETENTION_MONTHS)) continue;
    if (referencedPlanIds.has(p.id)) continue;
    await softDeleteRecord("productionPlans", p.id, "system-cron");
    deleted++;
  }

  return NextResponse.json({ data: { deleted, checked: plans.length } });
}
