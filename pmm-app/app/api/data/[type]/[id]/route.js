import { NextResponse } from "next/server";
import { isValidType } from "@/lib/entities";
import { getRecord, updateRecord, softDeleteRecord } from "@/lib/store";

// Production Plan date fields that must keep a field-level audit trail
// (old value -> new value, who, when) per the REVISI spec, surfaced via the
// History drawer on the Production page.
const PLAN_AUDITED_DATE_FIELDS = {
  wipDate: "WIP Date",
  readyStockOpsDate: "Ready Stock (OPS)",
  readyStockProdDate: "Ready Stock (PROD)",
  delayDate: "Delay Date (PROD)",
  fulfilledDate: "Fulfilled Date",
};

export async function GET(req, { params }) {
  const { type, id } = params;
  if (!isValidType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const record = await getRecord(type, id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req, { params }) {
  const { type, id } = params;
  if (!isValidType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const body = await req.json();
  const { user, ...patch } = body;
  if (type === "users") {
    // PIN fields may only be changed through the dedicated /api/users/pin endpoint,
    // which hashes the PIN server-side. Strip them out if a client tries to set them directly.
    delete patch.pin;
    delete patch.pinHash;
    delete patch.pinSalt;
  }
  try {
    let finalPatch = patch;
    if (type === "productionPlans") {
      const existing = await getRecord(type, id);
      const newHistoryEntries = [];
      if (existing) {
        for (const [field, label] of Object.entries(PLAN_AUDITED_DATE_FIELDS)) {
          if (!(field in patch)) continue;
          const oldValue = existing[field] || null;
          const newValue = patch[field] || null;
          if (oldValue === newValue) continue;
          newHistoryEntries.push({
            field,
            label,
            oldValue,
            newValue,
            user: user || "Unknown",
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (newHistoryEntries.length > 0) {
        finalPatch = { ...patch, history: [...(existing.history || []), ...newHistoryEntries] };
      }
    }
    const record = await updateRecord(type, id, finalPatch, user);
    return NextResponse.json({ data: record });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req, { params }) {
  const { type, id } = params;
  if (!isValidType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const url = new URL(req.url);
  const user = url.searchParams.get("user");
  try {
    await softDeleteRecord(type, id, user);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
