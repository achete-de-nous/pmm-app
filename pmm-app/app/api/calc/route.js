import { NextResponse } from "next/server";
import {
  computeMaterialBalances,
  computeWarehouseBalances,
  computeVendorBalances,
  computeDashboard,
  computeTrialBalance,
} from "@/lib/calc";

export async function GET(req) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "dashboard";
  const vendorId = url.searchParams.get("vendorId") || undefined;
  const materialName = url.searchParams.get("materialName") || undefined;

  switch (kind) {
    case "material-balances":
      return NextResponse.json({ data: await computeMaterialBalances() });
    case "warehouse-balances":
      return NextResponse.json({ data: await computeWarehouseBalances() });
    case "vendor-balances":
      return NextResponse.json({ data: await computeVendorBalances(vendorId) });
    case "trial-balance":
      return NextResponse.json({ data: await computeTrialBalance(materialName, vendorId) });
    case "dashboard":
    default:
      return NextResponse.json({ data: await computeDashboard() });
  }
}
