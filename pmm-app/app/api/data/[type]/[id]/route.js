import { NextResponse } from "next/server";
import { isValidType } from "@/lib/entities";
import { getRecord, updateRecord, softDeleteRecord } from "@/lib/store";

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
    const record = await updateRecord(type, id, patch, user);
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
