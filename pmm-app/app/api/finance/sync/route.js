import { NextResponse } from "next/server";
import { listRecords, createRecord, updateRecord, softDeleteRecord } from "@/lib/store";
import { resolveCogsForPlan, normalizeStatus, buildFinanceCategories, computeFinanceTotals } from "@/lib/calc";

// Finance auto-populates ONLY from Production Plans whose status is
// CONFIRMED - never from Pending/On Progress/On Hold/Done/Delayed directly.
// A Finance record is removed the moment its plan goes On Hold or is deleted
// entirely (point 7 of the earlier REVISI 2), so Finance never shows stale
// data for a plan that is no longer active. Every surviving Finance record
// also gets its material cost breakdown refreshed from the CURRENT COGS on
// every sync (COGS can be repriced after Finance was first created) - only
// dp/payments/financeProgress are left untouched, since those are user-owned.
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
  const surviving = [];
  for (const f of financeRecords) {
    const planId = f.planId || f.batchId;
    const plan = planId ? planById[planId] : null;
    const isOrphaned = !plan;
    const isOnHold = plan && normalizeStatus(plan.status) === "On Hold";
    if (isOrphaned || isOnHold) {
      await softDeleteRecord("financeRecords", f.id, user || "system");
      removed++;
    } else {
      surviving.push(f);
    }
  }

  // ---- Refresh material cost breakdown on every surviving Finance record ----
  // Categories are rebuilt from the CURRENT COGS every sync (price/MOQ can
  // change), but each category's own dp/payments/status is carried over by
  // matching category name (buildFinanceCategories' `existingCategories`
  // param) - a reprice never wipes out payments the user already recorded.
  let refreshed = 0;
  for (const f of surviving) {
    const plan = planById[f.planId || f.batchId];
    const productNameNoVariant = plan.productNameNoVariant || plan.articleName;
    const cogs = resolveCogsForPlan(plan.vendorId, productNameNoVariant, plan.plannedQty, cogsRecords);
    if (!cogs) continue;
    const categories = buildFinanceCategories(cogs, plan.plannedQty, f.categories || []);
    const { financeProgress } = computeFinanceTotals({ ...f, categories });
    await updateRecord("financeRecords", f.id, { categories, financeProgress }, user);
    refreshed++;
  }

  // ---- Create Finance for any Confirmed plan that doesn't have one yet ----
  const existingPlanIds = new Set(surviving.map((f) => f.planId || f.batchId));
  const confirmedPlans = plans.filter((p) => normalizeStatus(p.status) === "Confirmed");

  let created = 0;
  for (const plan of confirmedPlans) {
    if (existingPlanIds.has(plan.id)) continue;
    const productNameNoVariant = plan.productNameNoVariant || plan.articleName;
    const cogs = resolveCogsForPlan(plan.vendorId, productNameNoVariant, plan.plannedQty, cogsRecords);
    if (!cogs) continue; // nothing to finance yet - COGS hasn't been set up for this vendor+product

    const categories = buildFinanceCategories(cogs, plan.plannedQty, []);
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
        financeProgress: "Pending",
      },
      user
    );
    created++;
  }

  const finalList = await listRecords("financeRecords");
  return NextResponse.json({ data: { records: finalList, created, removed, refreshed } });
}
