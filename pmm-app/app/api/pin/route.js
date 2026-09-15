import { NextResponse } from "next/server";
import { getPin, setPin } from "@/lib/settings";

export async function POST(req) {
  const body = await req.json();
  const { action, pin, newPin } = body;
  const currentPin = await getPin();

  if (action === "verify") {
    return NextResponse.json({ data: { ok: pin === currentPin } });
  }

  if (action === "change") {
    if (pin !== currentPin) {
      return NextResponse.json({ error: "PIN saat ini salah" }, { status: 400 });
    }
    if (!newPin || newPin.length < 4) {
      return NextResponse.json({ error: "PIN baru minimal 4 digit" }, { status: 400 });
    }
    await setPin(newPin);
    return NextResponse.json({ data: { ok: true } });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
