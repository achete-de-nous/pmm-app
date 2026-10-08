import { listRecords } from "./store";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

// ---------- Material balances ----------
// Balance(material, location) = Incoming - Outgoing (from Material Transactions only)
// location is either "Warehouse" or a vendor id
export async function computeMaterialBalances() {
  const [materials, transactions, vendors] = await Promise.all([
    listRecords("materials"),
    listRecords("materialTransactions"),
    listRecords("vendors", { includeInactive: true }),
  ]);

  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const key = (materialName, location) => `${materialName}::${location}`;
  const balances = {};

  const bump = (materialName, location, delta) => {
    const k = key(materialName, location);
    if (!balances[k]) balances[k] = { materialName, location, qty: 0 };
    balances[k].qty += delta;
  };

  for (const t of transactions) {
    const qty = num(t.quantity);
    if (t.source && t.source !== "Supplier") {
      bump(t.materialName, t.source, -qty);
    }
    if (t.destination) {
      bump(t.materialName, t.destination, qty);
    }
  }

  const rows = Object.values(balances).map((row) => ({
    ...row,
    locationLabel: row.location === "Warehouse" ? "Warehouse" : vendorNameById[row.location] || row.location,
    isVendor: row.location !== "Warehouse",
  }));

  const materialByName = Object.fromEntries(materials.map((m) => [m.name, m]));
  return rows.map((r) => {
    const m = materialByName[r.materialName];
    const cogs = num(m?.currentCOGS);
    return { ...r, unit: m?.unit || "", cogs, totalValue: cogs * r.qty };
  });
}

export async function computeWarehouseBalances() {
  const all = await computeMaterialBalances();
  return all.filter((r) => r.location === "Warehouse");
}

export async function computeVendorBalances(vendorId) {
  const all = await computeMaterialBalances();
  const filtered = vendorId ? all.filter((r) => r.location === vendorId) : all.filter((r) => r.isVendor);
  return filtered;
}

// ---------- COGS resolution ----------
// Picks the current (non-deleted) COGS record for a vendor+product combo, tiered by MOQ:
// the highest MOQ that is <= plannedQty, falling back to the lowest MOQ available.
export function resolveCogsForPlan(vendorId, productName, plannedQty, cogsRecords) {
  const candidates = cogsRecords.filter(
    (c) => c.isCurrent && !c.deleted && c.vendorId === vendorId && c.productName === productName
  );
  if (candidates.length === 0) return null;
  const qty = num(plannedQty);
  const sorted = candidates.slice().sort((a, b) => num(a.moq) - num(b.moq));
  const fitting = sorted.filter((c) => num(c.moq) <= qty);
  return fitting.length > 0 ? fitting[fitting.length - 1] : sorted[0];
}

// ---------- Production plan status / delay logic ----------
// New status vocabulary (REVISI): Pending, Confirmed, On Progress, On Hold, Done, Delayed.
// Pending/Confirmed/On Hold are set manually (workflow steps / manual pause).
// On Progress/Done are derived automatically from Fulfilled Qty vs Planned Qty.
// "Delayed" is a derived flag (isDelayed) that can coexist with "Done" - both facts
// stay visible at once (plan can be DONE *and* Delayed) rather than overwriting status.
const OLD_STATUS_MAP = {
  "Partially Fulfilled": "On Progress",
  Fulfilled: "Done",
  DONE: "Done",
};

export function normalizeStatus(status) {
  if (!status) return "Pending";
  return OLD_STATUS_MAP[status] || status;
}

export function computePlanStatus(plan) {
  const planned = num(plan.plannedQty);
  const fulfilled = num(plan.fulfilledQty);
  let status = normalizeStatus(plan.status);

  // On Hold is a manual pause - never auto-overridden by qty progress.
  if (status !== "On Hold") {
    if (fulfilled > 0 && planned > 0 && fulfilled < planned) {
      status = "On Progress";
    } else if (planned > 0 && fulfilled >= planned) {
      status = "Done";
    }
  }

  const isDelayed = !!(
    plan.fulfilledDate &&
    plan.readyStockProdDate &&
    plan.fulfilledDate > plan.readyStockProdDate
  );

  return { status, isDelayed };
}

// ---------- Finance (REVISI 2: simplified single-amount model) ----------
// Finance now tracks ONE payable amount per procurement/production plan -
// "Total Harga Bahan Utama" = COGS per unit x Qty - with a single DP and any
// number of Payment Term (termin) installments against it. DP_MODES/
// PAYMENT_TERM_MODES back both dropdowns; "Manual" takes a direct nominal
// input and "Sisanya" (Payment Term only) auto-fills the remainder.
export const DP_MODES = ["10%", "20%", "30%", "40%", "50%", "75%", "Manual"];
export const PAYMENT_TERM_MODES = ["10%", "20%", "30%", "40%", "50%", "75%", "Sisanya", "Manual"];

function modePercent(mode) {
  if (!mode || mode === "Manual" || mode === "Sisanya") return null;
  const n = parseFloat(mode);
  return isNaN(n) ? null : n / 100;
}

export function computeDpAmount(dp, total) {
  if (!dp) return 0;
  if (dp.mode === "Manual") return num(dp.amount);
  const pct = modePercent(dp.mode);
  return pct != null ? pct * num(total) : 0;
}

// `priorPaid` = DP + every earlier termin's amount, needed to resolve "Sisanya".
export function computePaymentAmount(payment, total, priorPaid) {
  if (!payment) return 0;
  if (payment.mode === "Manual") return num(payment.amount);
  if (payment.mode === "Sisanya") return Math.max(0, num(total) - num(priorPaid));
  const pct = modePercent(payment.mode);
  return pct != null ? pct * num(total) : 0;
}

// Resolves live amounts for DP + every termin (in order), plus the totals
// derived from them. Nothing here is persisted pre-computed - percent-based
// amounts always recompute from the current Total Harga Bahan Utama.
export function computeFinanceTotals(record) {
  const total = num(record.totalHargaBahanUtama);
  const dpAmount = computeDpAmount(record.dp, total);
  let priorPaid = dpAmount;
  const payments = (record.payments || []).map((p) => {
    const amount = computePaymentAmount(p, total, priorPaid);
    priorPaid += amount;
    return { ...p, amount };
  });
  const totalPaid = dpAmount + payments.reduce((s, p) => s + num(p.amount), 0);
  const remaining = Math.max(0, total - totalPaid);
  return {
    total,
    dpAmount,
    payments,
    totalPaid,
    remaining,
    financeProgress: total > 0 && remaining <= 0 ? "Done" : "Pending",
  };
}

// ---------- Trial Balance ledger ----------
// Combines Material Transactions (in/out of a vendor) with Production material usage
// (derived from each plan's resolved COGS x qty) into one running-balance ledger per
// Material + Location, sorted earliest date first.
export async function computeTrialBalance(materialNameFilter, vendorIdFilter) {
  const [materials, transactions, vendors, plans, cogsRecords] = await Promise.all([
    listRecords("materials"),
    listRecords("materialTransactions"),
    listRecords("vendors", { includeInactive: true }),
    listRecords("productionPlans"),
    listRecords("cogsRecords"),
  ]);

  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const locLabel = (loc) => (loc === "Warehouse" ? "Warehouse" : vendorNameById[loc] || loc);

  const entries = [];

  for (const t of transactions) {
    if (materialNameFilter && t.materialName !== materialNameFilter) continue;
    const qty = num(t.quantity);
    if (t.source && t.source !== "Supplier") {
      if (!vendorIdFilter || t.source === vendorIdFilter) {
        entries.push({
          materialName: t.materialName,
          location: t.source,
          locationLabel: locLabel(t.source),
          date: t.deliveryDate || t.date || t.createdAt || "",
          type: "Transaction",
          description: `Keluar ke ${locLabel(t.destination)}`,
          qtyChange: -qty,
          valueChange: -num(t.materialCost ?? t.cogs),
        });
      }
    }
    if (t.destination) {
      if (!vendorIdFilter || t.destination === vendorIdFilter) {
        entries.push({
          materialName: t.materialName,
          location: t.destination,
          locationLabel: locLabel(t.destination),
          date: t.deliveryDate || t.date || t.createdAt || "",
          type: "Transaction",
          description: `Masuk dari ${t.source === "Supplier" ? "Supplier" : locLabel(t.source)}`,
          qtyChange: qty,
          valueChange: num(t.materialCost ?? t.cogs),
        });
      }
    }
  }

  for (const p of plans) {
    if (vendorIdFilter && p.vendorId !== vendorIdFilter) continue;
    const cogs = resolveCogsForPlan(p.vendorId, p.productNameNoVariant || p.articleName, p.plannedQty, cogsRecords);
    if (!cogs) continue;
    const qtyUsed = num(p.fulfilledQty) > 0 ? num(p.fulfilledQty) : num(p.plannedQty);
    for (const m of cogs.materials || []) {
      if (materialNameFilter && m.materialName !== materialNameFilter) continue;
      const usedQty = num(m.usage) * qtyUsed;
      entries.push({
        materialName: m.materialName,
        location: p.vendorId,
        locationLabel: locLabel(p.vendorId),
        date: p.wipDate || p.createdAt || "",
        type: "Production Usage",
        description: `${p.articleName} · Batch ${p.batch || "-"}`,
        qtyChange: -usedQty,
        valueChange: -(usedQty * num(m.pricePerUnit)),
      });
    }
  }

  entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const running = {};
  const materialByName = Object.fromEntries(materials.map((m) => [m.name, m]));
  return entries.map((e) => {
    const k = `${e.materialName}::${e.location}`;
    running[k] = (running[k] || 0) + e.qtyChange;
    return {
      ...e,
      unit: materialByName[e.materialName]?.unit || "",
      runningBalance: running[k],
      rowKey: `${k}::${e.type}::${e.date}::${e.description}`,
    };
  });
}

// ---------- Dashboard ----------
export async function computeDashboard() {
  const [materials, vendors, productionPlans, cogsRecords, defectRecords, financeRecords, materialBalances] =
    await Promise.all([
      listRecords("materials"),
      listRecords("vendors"),
      listRecords("productionPlans"),
      listRecords("cogsRecords"),
      listRecords("defectRecords"),
      listRecords("financeRecords"),
      computeMaterialBalances(),
    ]);

  const activePlans = productionPlans.filter((p) => normalizeStatus(p.status) !== "Done");
  const totalUnfulfilled = productionPlans.reduce((s, p) => s + Math.max(0, num(p.plannedQty) - num(p.fulfilledQty)), 0);
  const warehouseValue = materialBalances.filter((r) => r.location === "Warehouse").reduce((s, r) => s + r.totalValue, 0);
  const vendorValue = materialBalances.filter((r) => r.isVendor).reduce((s, r) => s + r.totalValue, 0);
  const totalDefectQty = defectRecords.reduce((s, d) => s + num(d.majorQty) + num(d.minorQty), 0);
  const unpaidFinance = financeRecords.filter((f) => f.financeProgress !== "Done").length;

  return {
    totalMaterials: materials.length,
    totalVendors: vendors.length,
    activeProductionPlans: activePlans.length,
    totalProductionUnfulfilled: totalUnfulfilled,
    warehouseMaterialValue: warehouseValue,
    vendorMaterialValue: vendorValue,
    cogsChangeCount: cogsRecords.filter((c) => c.isCurrent && !c.deleted).length,
    totalDefectQty,
    unpaidFinanceCount: unpaidFinance,
    isEmpty: materials.length === 0 && vendors.length === 0 && productionPlans.length === 0,
  };
}
