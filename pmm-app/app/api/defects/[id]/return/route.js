import { NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/store";

const num = (v) => Number(v) || 0;

// POST body: { qty, major, minor, success, user }
// `qty` = the quantity currently being processed as a return; major+minor+success
// must sum to exactly that qty. Major/Minor add onto the defect's running totals
// (goods confirmed defective on inspection); Success is goods that turned out fine
// and is only counted toward Returned Qty, not toward defects. Cost is
// recalculated from the updated Major/Minor totals x the snapshot COGS per unit.
export async function POST(req, { params }) {
  const { id } = params;
  const body = await req.json();
  const { qty, major, minor, success, user } = body;

  const record = await getRecord("defectRecords", id);
  if (!record) return NextResponse.json({ error: "Defect record tidak ditemukan" }, { status: 404 });

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

  const newMajor = num(record.majorQty) + majorNum;
  const newMinor = num(record.minorQty) + minorNum;
  const newReturned = num(record.returnedQty) + qtyNum;
  const newTotalQty = newMajor + newMinor;
  const cost = newMajor * num(record.cogsPerUnit) + newMinor * num(record.cogsPerUnit);

  const updated = await updateRecord(
    "defectRecords",
    id,
    { majorQty: newMajor, minorQty: newMinor, totalQty: newTotalQty, returnedQty: newReturned, cost },
    user
  );

  return NextResponse.json({ data: updated });
}
