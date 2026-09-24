import { NextResponse } from "next/server";
import { listRecords, getRecord, createRecord, updateRecord, findByField } from "@/lib/store";

const num = (v) => Number(v) || 0;

function computeTotals(materials, hargaJahit) {
  const materialRows = (materials || []).map((m) => ({
    ...m,
    usage: num(m.usage),
    pricePerUnit: num(m.pricePerUnit),
    total: num(m.usage) * num(m.pricePerUnit),
  }));
  const totalMaterials = materialRows.reduce((s, m) => s + m.total, 0);
  const totalCOGS = totalMaterials + num(hargaJahit);
  return { materialRows, totalMaterials, totalCOGS };
}

// POST body variants:
//  - { action: "add", vendorId, productNameNoVariant, moq, materials, hargaJahit, note, user }
//  - { action: "change", vendorId, productNameNoVariant, moq, materials, hargaJahit, note, user, supersedeId }
//      supersedeId: id of the specific record being edited (from the per-card Edit button),
//      or omitted to look up the current record for that Vendor+Product+MOQ combo (the
//      dropdown "Change COGS" flow).
//  - { action: "delete", id, user }
export async function POST(req) {
  const body = await req.json();
  const { action, user } = body;

  if (action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
    const target = await getRecord("cogsRecords", id);
    if (!target) return NextResponse.json({ error: "COGS tidak ditemukan" }, { status: 404 });
    if (target.deleted) return NextResponse.json({ error: "COGS ini sudah dihapus sebelumnya" }, { status: 400 });
    const now = new Date().toISOString();
    const updated = await updateRecord(
      "cogsRecords",
      id,
      { isCurrent: false, deleted: true, deletedBy: user || "Unknown", deletedAt: now },
      user
    );
    return NextResponse.json({ data: updated });
  }

  const { vendorId, productNameNoVariant, moq, materials, hargaJahit, note, supersedeId } = body;

  if (!vendorId || !productNameNoVariant || moq == null || moq === "") {
    return NextResponse.json({ error: "Vendor, Product, dan MOQ wajib diisi" }, { status: 400 });
  }
  if (!materials || materials.length === 0) {
    return NextResponse.json({ error: "Minimal 1 material wajib ditambahkan" }, { status: 400 });
  }

  const [vendor, product] = await Promise.all([
    getRecord("vendors", vendorId),
    findByField("products", "productNameNoVariant", productNameNoVariant),
  ]);
  if (!vendor) return NextResponse.json({ error: "Vendor tidak ditemukan" }, { status: 404 });
  if (!product) return NextResponse.json({ error: "Product tidak ditemukan" }, { status: 404 });

  const { materialRows, totalMaterials, totalCOGS } = computeTotals(materials, hargaJahit);
  const moqNum = num(moq);

  const allCogs = await listRecords("cogsRecords");
  const existingCurrent = allCogs.find(
    (c) => c.vendorId === vendorId && c.productName === productNameNoVariant && num(c.moq) === moqNum && c.isCurrent
  );

  if (action === "add") {
    if (existingCurrent) {
      return NextResponse.json(
        { error: "COGS untuk kombinasi Vendor + Product + MOQ ini sudah ada. Gunakan Change COGS untuk memperbarui." },
        { status: 400 }
      );
    }
    const record = await createRecord(
      "cogsRecords",
      {
        vendorId,
        vendorName: vendor.name,
        productName: productNameNoVariant,
        moq: moqNum,
        materials: materialRows,
        totalMaterials,
        hargaJahit: num(hargaJahit),
        totalCOGS,
        isCurrent: true,
        deleted: false,
        previousRecordId: null,
        editedBy: null,
        editedAt: null,
        note: note || "",
      },
      user
    );
    return NextResponse.json({ data: record });
  }

  if (action === "change") {
    const target = supersedeId ? await getRecord("cogsRecords", supersedeId) : existingCurrent;
    if (!target) {
      return NextResponse.json(
        { error: "Tidak ditemukan COGS aktif untuk kombinasi ini. Gunakan Add COGS untuk membuat baru." },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    // mark old as historical (superseded), keep all its data intact
    await updateRecord("cogsRecords", target.id, { isCurrent: false }, user);

    const record = await createRecord(
      "cogsRecords",
      {
        vendorId,
        vendorName: vendor.name,
        productName: productNameNoVariant,
        moq: moqNum,
        materials: materialRows,
        totalMaterials,
        hargaJahit: num(hargaJahit),
        totalCOGS,
        isCurrent: true,
        deleted: false,
        previousRecordId: target.id,
        editedBy: user || "Unknown",
        editedAt: now,
        note: note || "",
      },
      user
    );
    return NextResponse.json({ data: record });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
