import { NextResponse } from "next/server";
import { listRecords, createRecord, updateRecord } from "@/lib/store";

const num = (v) => Number(v) || 0;

function normalize(v) {
  return String(v || "").trim();
}

// POST body: { rows: [{sku, productName, productNameNoVariant, price, collection}], duplicateStrategy: "skip"|"update", user }
// Server re-validates and re-checks duplicates against fresh DB state before writing anything.
export async function POST(req) {
  const body = await req.json();
  const { rows, duplicateStrategy, user } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Tidak ada data untuk diimport" }, { status: 400 });
  }
  if (!["skip", "update"].includes(duplicateStrategy)) {
    return NextResponse.json({ error: "duplicateStrategy tidak valid" }, { status: 400 });
  }

  const existingProducts = await listRecords("products");
  const existingBySku = new Map(
    existingProducts.filter((p) => p.sku).map((p) => [p.sku.trim().toLowerCase(), p])
  );

  // Block on duplicate SKUs within the submitted batch itself.
  const countBySku = new Map();
  for (const r of rows) {
    const sku = normalize(r.sku).toLowerCase();
    if (!sku) continue;
    countBySku.set(sku, (countBySku.get(sku) || 0) + 1);
  }
  const fileDupes = [...countBySku.entries()].filter(([, c]) => c > 1).map(([sku]) => sku);
  if (fileDupes.length > 0) {
    return NextResponse.json(
      { error: `Ditemukan SKU duplikat di dalam file: ${fileDupes.join(", ")}. Perbaiki file sebelum import.` },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const r of rows) {
    const sku = normalize(r.sku);
    const productName = normalize(r.productName);
    const productNameNoVariant = normalize(r.productNameNoVariant);
    const collection = normalize(r.collection);
    const price = num(r.price);

    if (!sku || !productName || !productNameNoVariant) {
      errors.push({ sku: sku || "(kosong)", reason: "Data wajib tidak lengkap" });
      continue;
    }
    if (r.price !== "" && r.price != null && !isFinite(Number(String(r.price).replace(/[^0-9.-]/g, "")))) {
      errors.push({ sku, reason: "Harga bukan angka" });
      continue;
    }

    const existing = existingBySku.get(sku.toLowerCase());
    const payload = { sku, productName, productNameNoVariant, price, collection };

    if (existing) {
      if (duplicateStrategy === "update") {
        await updateRecord("products", existing.id, payload, user);
        updated++;
      } else {
        skipped++;
      }
    } else {
      const record = await createRecord("products", payload, user);
      existingBySku.set(sku.toLowerCase(), record);
      created++;
    }
  }

  return NextResponse.json({ data: { created, updated, skipped, errors } });
}
