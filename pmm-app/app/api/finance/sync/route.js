import { NextResponse } from "next/server";
import { listRecords, createRecord, getRecord } from "@/lib/store";
import { resolveCogsForPlan, normalizeStatus, buildFinanceCategories } from "@/lib/calc";

// Finance auto-populates ONLY from Production Plans whose status is
// CONFIRMED - never from Pending/On Progress/On Hold/Done/Delayed directly.
// Once a Finance record exists for a plan it is never re-created or deleted
// here, so payments already recorded are never lost even after the
// underlying plan progresses past Confirmed (On Progress/Done).
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { user } = body;

  const [plans, cogsRecords, financeRecords, vendors] = await Promise.all([
    listRecords("productionPlans"),
    listRecords("cogsRecords"),
    listRecords("financeRecords"),
    listRecords("vendors"),
  ]);

  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const existingPlanIds = new Set(financeRecords.map((f) => f.planId));

  const confirmedPlans = plans.filter((p) => normalizeStatus(p.status) === "Confirmed");

  let created = 0;
  for (const plan of confirmedPlans) {
    if (existingPlanIds.has(plan.id)) continue;
    const productNameNoVariant = plan.productNameNoVariant || plan.articleName;
    const cogs = resolveCogsForPlan(plan.vendorId, productNameNoVariant, plan.plannedQty, cogsRecords);
    if (!cogs) continue; // nothing to finance yet - COGS hasn't been set up for this vendor+product

    const categories = buildFinanceCategories(cogs, plan.plannedQty);
    await createRecord(
      "financeRecords",
      {
        planId: plan.id,
        batchId: plan.id, // kept for backward-compat with the retention cron's reference check
        batchLabel: plan.batch || "-",
        articleName: plan.articleName,
        vendorId: plan.vendorId,
        vendorName: vendorNameById[plan.vendorId] || "-",
        qty: Number(plan.plannedQty) || 0,
        wipDate: plan.wipDate || null,
        readyStockOpsDate: plan.readyStockOpsDate || null,
        readyStockProdDate: plan.readyStockProdDate || null,
        delayDateProd: plan.delayDate || null,
        categories,
        totalCOGS: cogs.totalCOGS,
        financeProgress: "Pending",
      },
      user
    );
    created++;
  }

  const finalList = await listRecords("financeRecords");
  return NextResponse.json({ data: { records: finalList, created } });
}
