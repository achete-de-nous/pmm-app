import { NextResponse } from "next/server";
import { listRecords, createRecord } from "@/lib/store";

const num = (v) => Number(v) || 0;

// POST body: { rows: [{articleName, wipDate, readyStockOps, plannedQty, vendorName}], user }
// Server re-validates each row against fresh Product / Sewing-Vendor data before inserting.
export async function POST(req) {
  const body = await req.json();
  const { rows, user } = body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Tidak ada data untuk diimport" }, { status: 400 });
  }

  const [products, vendors] = await Promise.all([listRecords("products"), listRecords("vendors")]);
  const productNames = new Set(products.map((p) => (p.productNameNoVariant || "").toLowerCase()));
  const sewingVendors = vendors.filter((v) => (v.vendorType || "").toLowerCase() === "sewing");
  const vendorByName = new Map(sewingVendors.map((v) => [v.name.toLowerCase(), v]));

  let created = 0;
  const errors = [];

  for (const r of rows) {
    const articleName = String(r.articleName || "").trim();
    const wipDate = String(r.wipDate || "").trim();
    const readyStockOps = String(r.readyStockOps || "").trim();
    const plannedQty = num(r.plannedQty);
    const vendorName = String(r.vendorName || "").trim();

    if (!articleName || !wipDate || !readyStockOps || plannedQty <= 0 || !vendorName) {
      errors.push({ articleName: articleName || "(kosong)", reason: "Data wajib tidak lengkap" });
      continue;
    }
    if (!productNames.has(articleName.toLowerCase())) {
      errors.push({ articleName, reason: "Article Name tidak ditemukan di Product" });
      continue;
    }
    const vendor = vendorByName.get(vendorName.toLowerCase());
    if (!vendor) {
      errors.push({ articleName, reason: `Vendor "${vendorName}" tidak ditemukan / bukan Vendor Type Sewing` });
      continue;
    }

    await createRecord(
      "productionPlans",
      {
        articleName,
        // Import template's "Article Name" column matches Product's "no
        // variant" family name (see classifyProductionRows), so it doubles
        // as the COGS-matching field too.
        productNameNoVariant: articleName,
        batch: "",
        wipDate,
        readyStockOpsDate: readyStockOps,
        readyStockProdDate: readyStockOps,
        delayDate: null,
        vendorId: vendor.id,
        plannedQty,
        fulfilledQty: 0,
        fulfilledDate: null,
        status: "Pending",
        isDelayed: false,
        fulfillHistory: [],
        history: [],
        note: "Imported dari file",
      },
      user
    );
    created++;
  }

  return NextResponse.json({ data: { created, errors } });
}
