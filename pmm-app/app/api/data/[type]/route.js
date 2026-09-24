import { NextResponse } from "next/server";
import { isValidType } from "@/lib/entities";
import { listRecords, createRecord, findByField } from "@/lib/store";

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
      const existing = await findByField("users", "name", name);
      if (existing) {
        return NextResponse.json(
          { error: `Nama "${name}" sudah terdaftar. Gunakan nama lain.` },
          { status: 400 }
        );
      }
      data.name = name;
    }
    const record = await createRecord(type, data, user);
    return NextResponse.json({ data: record });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
