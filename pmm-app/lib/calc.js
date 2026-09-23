import { listRecords } from "./store";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

// ---------- Finished product / Need to Produce ----------
// NeedToProduce(article) = max(0, TotalSalesQty - InitialBalance - TotalFulfilledQty)
// AvailableStock(article) = InitialBalance + TotalFulfilledQty - TotalSalesQty
export async function computeArticleStockSummary() {
  const [articles, initialBalances, weeklySales, productionPlans] = await Promise.all([
    listRecords("articles"),
    listRecords("finishedInitialBalances"),
    listRecords("weeklySales"),
    listRecords("productionPlans"),
  ]);

  const byArticle = {};
  for (const a of articles) {
    byArticle[a.name] = {
      articleName: a.name,
      articleId: a.id,
      initialBalance: 0,
      totalSales: 0,
      totalFulfilled: 0,
      totalPlanned: 0,
    };
  }
  const ensure = (name) => {
    if (!byArticle[name]) {
      byArticle[name] = { articleName: name, articleId: null, initialBalance: 0, totalSales: 0, totalFulfilled: 0, totalPlanned: 0 };
    }
    return byArticle[name];
  };

  for (const b of initialBalances) ensure(b.articleName).initialBalance += num(b.qty);
  for (const s of weeklySales) ensure(s.articleName).totalSales += num(s.salesQty);
  for (const p of productionPlans) {
    const row = ensure(p.articleName);
    row.totalFulfilled += num(p.fulfilledQty);
    row.totalPlanned += num(p.plannedQty);
  }

  return Object.values(byArticle).map((row) => {
    const availableStock = row.initialBalance + row.totalFulfilled - row.totalSales;
    const needToProduce = Math.max(0, row.totalSales - row.initialBalance - row.totalFulfilled);
    return { ...row, availableStock, needToProduce };
  });
}

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

// ---------- Dashboard ----------
export async function computeDashboard() {
  const [articles, materials, vendors, weeklySales, productionPlans, cogsRecords, reconciliations, stockSummary, materialBalances] =
    await Promise.all([
      listRecords("articles"),
      listRecords("materials"),
      listRecords("vendors"),
      listRecords("weeklySales"),
      listRecords("productionPlans"),
      listRecords("cogsRecords"),
      listRecords("reconciliations"),
      computeArticleStockSummary(),
      computeMaterialBalances(),
    ]);

  const totalNeedToProduce = stockSummary.reduce((s, r) => s + r.needToProduce, 0);
  const activePlans = productionPlans.filter((p) => p.status !== "Fulfilled" && p.status !== "Cancelled");
  const totalUnfulfilled = productionPlans.reduce((s, p) => s + Math.max(0, num(p.plannedQty) - num(p.fulfilledQty)), 0);
  const warehouseValue = materialBalances.filter((r) => r.location === "Warehouse").reduce((s, r) => s + r.totalValue, 0);
  const vendorValue = materialBalances.filter((r) => r.isVendor).reduce((s, r) => s + r.totalValue, 0);
  const recentWeeklySalesQty = weeklySales.reduce((s, r) => s + num(r.salesQty), 0);
  const lastReconVariance = reconciliations
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0]?.variance;

  return {
    totalArticles: articles.length,
    totalMaterials: materials.length,
    totalVendors: vendors.length,
    totalWeeklySalesQty: recentWeeklySalesQty,
    totalNeedToProduce,
    activeProductionPlans: activePlans.length,
    totalProductionUnfulfilled: totalUnfulfilled,
    warehouseMaterialValue: warehouseValue,
    vendorMaterialValue: vendorValue,
    cogsChangeCount: cogsRecords.length,
    lastReconciliationVariance: lastReconVariance ?? null,
    isEmpty: articles.length === 0 && materials.length === 0 && vendors.length === 0,
  };
}
