import { NextResponse } from "next/server";
import { listRecords, createRecord, updateRecord } from "@/lib/store";

// Upserts a manual "Check" note against one Trial Balance ledger row, keyed by
// `rowKey` (a stable composite of material+location+type+date+description
// computed in lib/calc.js's computeTrialBalance).
export async function POST(req) {
  const body = await req.json();
  const { rowKey, materialName, value, user } = body;
  if (!rowKey) return NextResponse.json({ error: "rowKey wajib diisi" }, { status: 400 });

  const existing = await listRecords("reconciliations");
  const found = existing.find((r) => r.rowKey === rowKey);

  if (found) {
    const updated = await updateRecord("reconciliations", found.id, { value }, user);
    return NextResponse.json({ data: updated });
  }

  const created = await createRecord("reconciliations", { rowKey, materialName, value }, user);
  return NextResponse.json({ data: created });
}
