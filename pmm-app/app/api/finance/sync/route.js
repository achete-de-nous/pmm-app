import { NextResponse } from "next/server";
import { listRecords, createRecord, softDeleteRecord } from "@/lib/store";
import { resolveCogsForPlan, normalizeStatus } from "@/lib/calc";

// Finance auto-populates ONLY from Production Plans whose status is
// CONFIRMED - never from Pending/On Progress/On Hold/Done/Delayed directly.
// Once a Finance record exists for a plan it is kept as-is while the plan
// progresses (On Progress/Done) - but it is removed the moment the plan goes
// On Hold or is deleted entirely (REVISI 2, point 7), so Finance never shows
// stale data for a plan that is no longer active.
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
  const planById = Object.fromEntries(plans.map((p) => [p.id, p]));

  // ---- Cascade cleanup: drop any Finance record whose plan is gone or On Hold ----
  let removed = 0;
  for (const f of financeRecords) {
    const planId = f.planId || f.batchId;
    const plan = planId ? planById[planId] : null;
    const isOrphaned = !plan;
    const isOnHold = plan && normalizeStatus(plan.status) === "On Hold";
    if (isOrphaned || isOnHold) {
      await softDeleteRecord("financeRecords", f.id, user || "system");
      removed++;
    }
  }

  const remainingFinance = removed > 0 ? financeRecords.filter((f) => !(!planById[f.planId || f.batchId] || normalizeStatus(planById[f.planId || f.batchId]?.status) === "On Hold")) : financeRecords;
  const existingPlanIds = new Set(remainingFinance.map((f) => f.planId));

  const confirmedPlans = plans.filter((p) => normalizeStatus(p.status) === "Confirmed");

  let created = 0;
  for (const plan of confirmedPlans) {
    if (existingPlanIds.has(plan.id)) continue;
    const productNameNoVariant = plan.productNameNoVariant || plan.articleName;
    const cogs = resolveCogsForPlan(plan.vendorId, productNameNoVariant, plan.plannedQty, cogsRecords);
    if (!cogs) continue; // nothing to finance yet - COGS hasn't been set up for this vendor+product

    const qty = Number(plan.plannedQty) || 0;
    const cogsPerUnit = Number(cogs.totalCOGS) || 0;
    await createRecord(
      "financeRecords",
      {
        planId: plan.id,
        batchId: plan.id, // kept for backward-compat with the retention cron's reference check
        batchLabel: plan.batch || "-",
        articleName: plan.articleName,
        vendorId: plan.vendorId,
        vendorName: vendorNameById[plan.vendorId] || "-",
        qty,
        wipDate: plan.wipDate || null,
        readyStockOpsDate: plan.readyStockOpsDate || null,
        readyStockProdDate: plan.readyStockProdDate || null,
        delayDateProd: plan.delayDate || null,
        cogsPerUnit,
        totalHargaBahanUtama: cogsPerUnit * qty,
        dp: { mode: "10%", amount: 0 },
        payments: [],
        financeProgress: "Pending",
      },
      user
    );
    created++;
  }

  const finalList = await listRecords("financeRecords");
  return NextResponse.json({ data: { records: finalList, created, removed } });
}
