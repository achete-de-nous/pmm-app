import * as XLSX from "xlsx";

export const TEMPLATE_HEADERS = ["Article Name", "WIP Date", "Ready Stock (OPS)", "Planned Qty", "Vendor"];

const HEADER_ALIASES = {
  articleName: ["articlename"],
  wipDate: ["wipdate"],
  readyStockOps: ["readystockops", "readystockdateops"],
  plannedQty: ["plannedqty", "qty"],
  vendorName: ["vendor", "vendorname"],
};

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toDateString(raw) {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const s = String(raw).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export function downloadProductionTemplate() {
  const wb = XLSX.utils.book_new();
  const example = [["Brisa Jacket", "2026-09-01", "2026-09-20", 50, "CV Jahit Rapi"]];
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...example]);
  ws["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Production Template");
  XLSX.writeFile(wb, "Production_Template.xlsx");
}

export function parseProductionFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });

        if (!aoa || aoa.length === 0) {
          resolve({ headerError: "File kosong atau tidak terbaca.", rows: [] });
          return;
        }

        const headers = aoa[0].map(normalizeHeader);
        const colIndex = {};
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
          colIndex[field] = headers.findIndex((h) => aliases.includes(h));
        }
        const missing = Object.keys(HEADER_ALIASES).filter((f) => colIndex[f] === -1);
        if (missing.length > 0) {
          resolve({
            headerError: `Header tidak sesuai template. Pastikan file memiliki kolom: ${TEMPLATE_HEADERS.join(", ")}.`,
            rows: [],
          });
          return;
        }

        const rows = [];
        for (let i = 1; i < aoa.length; i++) {
          const raw = aoa[i];
          if (raw.every((c) => String(c || "").trim() === "")) continue;

          const articleName = String(raw[colIndex.articleName] ?? "").trim();
          const wipDate = toDateString(raw[colIndex.wipDate]);
          const readyStockOps = toDateString(raw[colIndex.readyStockOps]);
          const plannedQtyRaw = raw[colIndex.plannedQty];
          const vendorName = String(raw[colIndex.vendorName] ?? "").trim();
          const plannedQty = Number(String(plannedQtyRaw).replace(/[^0-9.-]/g, ""));

          const errors = [];
          if (!articleName) errors.push("Article Name kosong");
          if (!wipDate) errors.push("WIP Date kosong/tidak valid");
          if (!readyStockOps) errors.push("Ready Stock (OPS) kosong/tidak valid");
          if (!plannedQty || !isFinite(plannedQty) || plannedQty <= 0) errors.push("Planned Qty bukan angka valid");
          if (!vendorName) errors.push("Vendor kosong");

          rows.push({ rowNumber: i + 1, articleName, wipDate, readyStockOps, plannedQty: plannedQty || 0, vendorName, errors });
        }

        resolve({ headerError: null, rows });
      } catch (e) {
        reject(new Error("Gagal membaca isi file. Pastikan file berformat .xlsx atau .csv yang valid."));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Cross-checks each row's Article Name against Product data and Vendor against
// Sewing-type vendors, attaching resolved ids or an error status.
export function classifyProductionRows(rows, products, sewingVendors) {
  const productNames = new Set(products.map((p) => (p.productNameNoVariant || "").toLowerCase()));
  const vendorByName = new Map(sewingVendors.map((v) => [v.name.toLowerCase(), v]));

  return rows.map((r) => {
    if (r.errors.length > 0) return { ...r, status: "error" };
    const errors = [];
    if (!productNames.has(r.articleName.toLowerCase())) errors.push("Article Name tidak ditemukan di Product");
    const vendor = vendorByName.get(r.vendorName.toLowerCase());
    if (!vendor) errors.push("Vendor tidak ditemukan / bukan Vendor Type Sewing");
    if (errors.length > 0) return { ...r, status: "error", errors };
    return { ...r, status: "valid", vendorId: vendor.id };
  });
}
