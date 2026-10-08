import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";

const num = (v) => Number(v) || 0;
const uid = () => Math.random().toString(36).slice(2, 10);

// Returns are now kept as individual history entries (`returnHistory`) rather
// than being accumulated irreversibly into majorQty/minorQty/returnedQty.
// This lets a mistaken return entry be deleted (action: "delete") without
// touching the defect's original Major/Minor qty or any other return entry -
// everything is recomputed from (initial defect) + (remaining history).
//
// POST body:
//  - { action: "add" (default), qty, major, minor, success, user }
//      major+minor+success must sum to exactly qty.
//  - { action: "delete", returnId, user }
export async function POST(req, { params }) {
  const { id } = params;
  const body = await req.json();
  const { action, user } = body;

  const record = await getRecord("defectRecords", id);
  if (!record) return NextResponse.json({ error: "Defect record tidak ditemukan" }, { status: 404 });

  // Self-heal legacy records: if initial*Qty was never recorded, the current
  // majorQty/minorQty (before any history existed) is the best available
  // baseline.
  const initialMajorQty = record.initialMajorQty ?? record.majorQty ?? 0;
  const initialMinorQty = record.initialMinorQty ?? record.minorQty ?? 0;
  const history = record.returnHistory || [];

  function recompute(newHistory) {
    const major = num(initialMajorQty) + newHistory.reduce((s, h) => s + num(h.major), 0);
    const minor = num(initialMinorQty) + newHistory.reduce((s, h) => s + num(h.minor), 0);
    const returnedQty = newHistory.reduce((s, h) => s + num(h.qty), 0);
    const totalQty = major + minor;
    const cost = totalQty * num(record.cogsPerUnit);
    return { majorQty: major, minorQty: minor, totalQty, returnedQty, cost };
  }

  if (action === "delete") {
    const { returnId } = body;
    if (!returnId) return NextResponse.json({ error: "returnId wajib diisi" }, { status: 400 });
    const exists = history.some((h) => h.id === returnId);
    if (!exists) return NextResponse.json({ error: "Return history tidak ditemukan" }, { status: 404 });
    const newHistory = history.filter((h) => h.id !== returnId);
    const totals = recompute(newHistory);
    const updated = await updateRecord(
      "defectRecords",
      id,
      { initialMajorQty, initialMinorQty, returnHistory: newHistory, ...totals },
      user
    );
    return NextResponse.json({ data: updated });
  }

  // default action: "add"
  const { qty, major, minor, success } = body;
  const qtyNum = num(qty);
  const majorNum = num(major);
  const minorNum = num(minor);
  const successNum = num(success);

  if (qtyNum <= 0) {
    return NextResponse.json({ error: "Qty yang direturn wajib diisi" }, { status: 400 });
  }
  if (majorNum + minorNum + successNum !== qtyNum) {
    return NextResponse.json(
      { error: "Total Major + Minor + Success harus sama dengan Qty yang direturn" },
      { status: 400 }
    );
  }

  const entry = {
    id: uid(),
    qty: qtyNum,
    major: majorNum,
    minor: minorNum,
    success: successNum,
    date: new Date().toISOString(),
    user: user || "Unknown",
  };
  const newHistory = [...history, entry];
  const totals = recompute(newHistory);

  const updated = await updateRecord(
    "defectRecords",
    id,
    { initialMajorQty, initialMinorQty, returnHistory: newHistory, ...totals },
    user
  );

  return NextResponse.json({ data: updated });
}
