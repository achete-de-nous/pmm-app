import { NextResponse } from "next/server";
import { listRecords, getRecord, updateRecord } from "@/lib/store";
import { hashPin, generateSalt, verifyPinHash, isValidPinFormat } from "@/lib/hash";

// POST body variants:
//  - { action: "verify", userId, pin } -> { ok, needsSetup? }  (used to log in as a user)
//  - { action: "change", userId, currentPin, newPin, actingUser } -> requires currentPin to match
//      (self-service: user changes their own PIN)
//  - { action: "set", userId, newPin, actingUser } -> no currentPin required
//      (admin/teammate reset for a user who forgot their PIN)
export async function POST(req) {
  const body = await req.json();
  const { action } = body;

  if (action === "verify") {
    const { userId, pin } = body;
    if (!userId) return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 });
    const user = await getRecord("users", userId);
    if (!user || user.active === false) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    }
    if (!user.pinHash) {
      return NextResponse.json({ data: { ok: false, needsSetup: true } });
    }
    const ok = verifyPinHash(pin, user.pinSalt, user.pinHash);
    return NextResponse.json({ data: { ok } });
  }

  if (action === "set" || action === "change") {
    const { userId, newPin, currentPin, actingUser } = body;
    if (!userId) return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 });
    if (!isValidPinFormat(newPin)) {
      return NextResponse.json({ error: "PIN harus 4-8 digit angka" }, { status: 400 });
    }
    const user = await getRecord("users", userId);
    if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

    if (action === "change") {
      if (!user.pinHash || !verifyPinHash(currentPin, user.pinSalt, user.pinHash)) {
        return NextResponse.json({ error: "PIN saat ini salah" }, { status: 400 });
      }
    }

    // Enforce that no two users share the same PIN.
    const allUsers = await listRecords("users", { includeInactive: true });
    const collision = allUsers.find(
      (u) => u.id !== userId && u.pinHash && verifyPinHash(newPin, u.pinSalt, u.pinHash)
    );
    if (collision) {
      return NextResponse.json(
        { error: "PIN ini sudah dipakai user lain. Gunakan PIN yang berbeda." },
        { status: 400 }
      );
    }

    const salt = generateSalt();
    const pinHash = hashPin(newPin, salt);
    const updated = await updateRecord("users", userId, { pinHash, pinSalt: salt }, actingUser || user.name);
    const { pinHash: _h, pinSalt: _s, ...safe } = updated;
    return NextResponse.json({ data: safe });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
