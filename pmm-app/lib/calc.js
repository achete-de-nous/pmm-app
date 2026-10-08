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

// ---------- Finance (REVISI 2) ----------
// Finance itemizes EVERY material a COGS record uses (not just one lump
// value): Material Name / Qty / Unit / COGS(per unit) / Total Payment, summed
// into "Total Harga Bahan Utama". A single DP plus any number of Payment Term
// (termin) installments are tracked against that total. DP_MODES/
// PAYMENT_TERM_MODES back both dropdowns; "Manual" takes a direct nominal
// input and "Sisanya" (Payment Term only) auto-fills the remainder off
// whatever has been recorded so far (regardless of paid status). Each DP/
// termin also carries its own Payment Date, Status (Pending/Paid) and an
// optional Payment Proof/Reference note - only amounts actually marked Paid
// count against "remaining".
export const DP_MODES = ["10%", "20%", "30%", "40%", "50%", "75%", "Manual"];
export const PAYMENT_TERM_MODES = ["10%", "20%", "30%", "40%", "50%", "75%", "Sisanya", "Manual"];
export const PAYMENT_STATUSES = ["Pending", "Paid"];

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

// `priorRecorded` = DP + every earlier termin's amount, needed to resolve
// "Sisanya" - this uses recorded (planned) amounts, not just paid ones.
export function computePaymentAmount(payment, total, priorRecorded) {
  if (!payment) return 0;
  if (payment.mode === "Manual") return num(payment.amount);
  if (payment.mode === "Sisanya") return Math.max(0, num(total) - num(priorRecorded));
  const pct = modePercent(payment.mode);
  return pct != null ? pct * num(total) : 0;
}

// Builds the full material line-item breakdown for a resolved COGS record x
// qty - "Jangan hanya menampilkan satu material utama": every material the
// COGS uses gets its own Qty/Unit/COGS(per unit)/Total Payment row. Sewing
// cost (hargaJahit) is a service cost, not a material, so it is intentionally
// left out of "Total Harga Bahan Utama".
export function buildFinanceMaterials(cogs, qty) {
  const q = num(qty);
  return (cogs?.materials || []).map((m) => {
    const qtyTotal = num(m.usage) * q;
    const cogsPerUnit = num(m.pricePerUnit);
    return {
      materialName: m.materialName,
      qtyTotal,
      unit: m.unit,
      cogsPerUnit,
      totalPayment: qtyTotal * cogsPerUnit,
    };
  });
}

export function sumFinanceMaterials(materials) {
  return (materials || []).reduce((s, m) => s + num(m.totalPayment), 0);
}

// ---------- Finance (REVISI 3) ----------
// Payment tracking is now PER MATERIAL/CATEGORY, not one lump sum for the
// whole production. Materials are grouped by their Fabric Category (the
// same category configured per Material in Materials/COGS - e.g. Kain,
// Furing, Kancing...), plus a dedicated "Jahit" category for the sewing
// service cost (hargaJahit). Each category gets its own Total Cost, DP,
// Payment Term installments, Planned/Actual Payment Date and Payment
// Status - fully independent from every other category on the same
// production (point A/B of REVISI 3).
const emptyDp = () => ({ mode: "10%", amount: 0, plannedDate: "", actualDate: "", status: "Pending", proof: "" });

// Builds the Material Cost breakdown for a resolved COGS record x qty,
// grouped into payment categories. `existingCategories` (if given) carries
// over each category's own dp/payments/status when costs are refreshed
// (e.g. after a COGS reprice), matched by category name - so editing a
// production's COGS never wipes out payments already recorded.
export function buildFinanceCategories(cogs, qty, existingCategories = []) {
  const materials = buildFinanceMaterials(cogs, qty).map((m, i) => ({
    ...m,
    category: cogs?.materials?.[i]?.fabricCategory || "Lainnya",
  }));

  const groups = {};
  const order = [];
  for (const m of materials) {
    const cat = m.category || "Lainnya";
    if (!groups[cat]) {
      groups[cat] = { category: cat, materials: [], totalCost: 0 };
      order.push(cat);
    }
    groups[cat].materials.push(m);
    groups[cat].totalCost += num(m.totalPayment);
  }

  const hargaJahit = num(cogs?.hargaJahit);
  if (hargaJahit > 0) {
    groups["Jahit"] = { category: "Jahit", materials: [], totalCost: hargaJahit, isService: true };
    order.push("Jahit");
  }

  const existingByName = Object.fromEntries((existingCategories || []).map((c) => [c.category, c]));
  return order.map((cat) => {
    const g = groups[cat];
    const prev = existingByName[cat];
    return {
      ...g,
      dp: prev?.dp || emptyDp(),
      payments: prev?.payments || [],
    };
  });
}

// Resolves live amounts for one category's DP + every termin (in order).
// Percent-based amounts always recompute from that category's own Total
// Cost. "remaining" only drops once a DP/termin is marked Paid. Status is
// derived (never stored/chosen directly): Paid once fully covered, DP Paid
// once the DP is marked Paid but the category isn't fully covered yet,
// otherwise Pending.
export function computeFinanceCategoryTotals(cat) {
  const total = num(cat.totalCost);
  const dp = cat.dp || emptyDp();
  const dpAmount = computeDpAmount(dp, total);
  let priorRecorded = dpAmount;
  const payments = (cat.payments || []).map((p) => {
    const amount = computePaymentAmount(p, total, priorRecorded);
    priorRecorded += amount;
    return { ...p, amount };
  });
  const totalPaid =
    (dp.status === "Paid" ? dpAmount : 0) + payments.reduce((s, p) => s + (p.status === "Paid" ? num(p.amount) : 0), 0);
  const remaining = Math.max(0, total - totalPaid);
  let status = "Pending";
  if (total <= 0 || remaining <= 0) status = "Paid";
  else if (dp.status === "Paid") status = "DP Paid";
  return { ...cat, total, dp: { ...dp, amount: dpAmount }, dpAmount, payments, totalPaid, remaining, status };
}

// Rolls every category up into the production-level totals. Finance DONE
// (point D) requires EVERY category that actually has a cost to be fully
// Paid - a single category still at "DP Paid" or "Pending" keeps the whole
// production at "Pending", even if every other category is Paid.
export function computeFinanceTotals(record) {
  const categories = (record.categories || []).map(computeFinanceCategoryTotals);
  const total = categories.reduce((s, c) => s + c.total, 0);
  const totalPaid = categories.reduce((s, c) => s + c.totalPaid, 0);
  const remaining = categories.reduce((s, c) => s + c.remaining, 0);
  const costed = categories.filter((c) => c.total > 0);
  const allPaid = costed.length > 0 && costed.every((c) => c.status === "Paid");
  return {
    categories,
    total,
    totalPaid,
    remaining,
    financeProgress: allPaid ? "Done" : "Pending",
  };
}

// Flattens every DP/termin entry across every category of every record into
// one list, tagged with its own plannedDate/actualDate/status/amount/record
// - used to build the "Pending Payment by Month" dashboard (point F): bucket
// by the MONTH OF plannedDate for entries still Pending, and separately by
// the month of actualDate for entries already Paid (actual cashflow).
export function flattenFinanceEntries(records) {
  const out = [];
  for (const record of records) {
    const { categories } = computeFinanceTotals(record);
    for (const cat of categories) {
      const rows = [
        { ...cat.dp, amount: cat.dpAmount, label: "DP", kind: "dp" },
        ...cat.payments.map((p, i) => ({ ...p, label: `Termin ${i + 1}`, kind: "termin" })),
      ];
      for (const row of rows) {
        if (num(row.amount) <= 0) continue;
        out.push({
          recordId: record.id,
          articleName: record.articleName,
          batchLabel: record.batchLabel,
          category: cat.category,
          ...row,
        });
      }
    }
  }
  return out;
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
    // "Pembelian Bahan": the "Dari" vendor is just the supplier/source of the
    // material, not a location that holds stock - so it is never booked to
    // Trial Balance, only the "Ke" vendor is (REVISI 2). Legacy transactions
    // with no transactionType, and "Perpindahan Bahan" transfers, keep
    // booking both legs as before.
    const skipSourceLeg = t.transactionType === "Pembelian Bahan";
    if (t.source && t.source !== "Supplier" && !skipSourceLeg) {
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
