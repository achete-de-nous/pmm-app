import { NextResponse } from "next/server";
import { isValidType } from "@/lib/entities";
import { listRecords, createRecord } from "@/lib/store";
import { hashPin, generateSalt, verifyPinHash, isValidPinFormat } from "@/lib/hash";

export async function GET(req, { params }) {
  const { type } = params;
  if (!isValidType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";
  const records = await listRecords(type, { includeInactive });
  return NextResponse.json({ data: records });
}

export async function POST(req, { params }) {
  const { type } = params;
  if (!isValidType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const body = await req.json();
  const { user, ...data } = body;
  try {
    if (type === "users") {
      const name = (data.name || "").trim();
      if (!name) return NextResponse.json({ error: "Nama tidak boleh kosong" }, { status: 400 });
      // Only currently-active users block a name/PIN from being reused — a deleted
      // user's name and PIN both become available again for a new registration.
      const activeUsers = await listRecords("users");
      const existing = activeUsers.find((u) => (u.name || "").toLowerCase() === name.toLowerCase());
      if (existing) {
        return NextResponse.json(
          { error: `Nama "${name}" sudah terdaftar. Gunakan nama lain.` },
          { status: 400 }
        );
      }
      if (!isValidPinFormat(data.pin)) {
        return NextResponse.json({ error: "PIN harus 4-8 digit angka" }, { status: 400 });
      }
      const collision = activeUsers.find((u) => u.pinHash && verifyPinHash(data.pin, u.pinSalt, u.pinHash));
      if (collision) {
        return NextResponse.json(
          { error: "PIN ini sudah dipakai user lain. Gunakan PIN yang berbeda." },
          { status: 400 }
        );
      }
      const salt = generateSalt();
      data.name = name;
      data.pinHash = hashPin(data.pin, salt);
      data.pinSalt = salt;
      delete data.pin;
    }
    const record = await createRecord(type, data, user);
    return NextResponse.json({ data: record });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
