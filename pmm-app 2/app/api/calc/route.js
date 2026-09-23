import { NextResponse } from "next/server";
import {
  computeArticleStockSummary,
  computeMaterialBalances,
  computeWarehouseBalances,
  computeVendorBalances,
  computeDashboard,
} from "@/lib/calc";

export async function GET(req) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "dashboard";
  const vendorId = url.searchParams.get("vendorId") || undefined;

  switch (kind) {
    case "stock-summary":
      return NextResponse.json({ data: await computeArticleStockSummary() });
    case "material-balances":
      return NextResponse.json({ data: await computeMaterialBalances() });
    case "warehouse-balances":
      return NextResponse.json({ data: await computeWarehouseBalances() });
    case "vendor-balances":
      return NextResponse.json({ data: await computeVendorBalances(vendorId) });
    case "dashboard":
    default:
      return NextResponse.json({ data: await computeDashboard() });
  }
}
