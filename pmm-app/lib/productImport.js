import * as XLSX from "xlsx";

export const TEMPLATE_HEADERS = ["SKU", "Product", "Product Name w/o Variant", "Harga", "Collection"];

const TEMPLATE_EXAMPLE_ROWS = [
  ["BRISA-BRN-S", "Brisa Jacket Brown S", "Brisa Jacket", 465000, "Essentials"],
  ["BRISA-BRN-M", "Brisa Jacket Brown M", "Brisa Jacket", 465000, "Essentials"],
  ["BRISA-BLK-S", "Brisa Jacket Black S", "Brisa Jacket", 465000, "Essentials"],
];

// Canonical field <- accepted header spellings (normalized: lowercase, alphanumeric only).
const HEADER_ALIASES = {
  sku: ["sku"],
  productName: ["product", "productname"],
  productNameNoVariant: ["productnamewovariant", "productnamewithoutvariant", "productnamenovariant"],
  price: ["harga", "price"],
  collection: ["collection", "koleksi"],
};

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parsePrice(raw) {
  if (raw === "" || raw == null) return { ok: false, value: 0 };
  if (typeof raw === "number") {
    return isFinite(raw) ? { ok: true, value: raw } : { ok: false, value: 0 };
  }
  const cleaned = String(raw).replace(/[^0-9-]/g, "");
  if (cleaned === "" || cleaned === "-") return { ok: false, value: 0 };
  const value = Number(cleaned);
  return { ok: isFinite(value), value };
}

export function downloadProductTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS]);
  ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Product Template");
  XLSX.writeFile(wb, "Product_Template.xlsx");
}

// Reads an .xlsx/.csv (or Google Sheets export of either) File object and returns
// { headerError, rows } where each row is { rowNumber, sku, productName, productNameNoVariant, price, collection, errors[] }
export function parseProductFile(file) {
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
          const idx = headers.findIndex((h) => aliases.includes(h));
          colIndex[field] = idx;
        }

        const missing = ["sku", "productName", "productNameNoVariant", "price"].filter((f) => colIndex[f] === -1);
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
          const isEmpty = raw.every((c) => String(c || "").trim() === "");
          if (isEmpty) continue;

          const sku = String(raw[colIndex.sku] ?? "").trim();
          const productName = String(raw[colIndex.productName] ?? "").trim();
          const productNameNoVariant = String(raw[colIndex.productNameNoVariant] ?? "").trim();
          const collection = colIndex.collection !== -1 ? String(raw[colIndex.collection] ?? "").trim() : "";
          const priceParsed = parsePrice(raw[colIndex.price]);

          const errors = [];
          if (!sku) errors.push("SKU kosong");
          if (!productName) errors.push("Product kosong");
          if (!productNameNoVariant) errors.push("Product Name w/o Variant kosong");
          if (!priceParsed.ok) errors.push("Harga bukan angka");

          rows.push({
            rowNumber: i + 1,
            sku,
            productName,
            productNameNoVariant,
            price: priceParsed.value,
            collection,
            errors,
          });
        }

        resolve({ headerError: null, rows });
      } catch (e) {
        reject(new Error("Gagal membaca isi file. Pastikan file berformat .xlsx atau .csv yang valid."));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Enriches parsed rows with duplicate status against each other and against existing products.
// status: "error" | "duplicate-file" | "duplicate-existing" | "new"
export function classifyRows(rows, existingProducts) {
  const existingBySku = new Map(existingProducts.filter((p) => p.sku).map((p) => [p.sku.trim().toLowerCase(), p]));

  const countBySku = new Map();
  for (const r of rows) {
    if (!r.sku) continue;
    const k = r.sku.toLowerCase();
    countBySku.set(k, (countBySku.get(k) || 0) + 1);
  }

  return rows.map((r) => {
    if (r.errors.length > 0) {
      return { ...r, status: "error" };
    }
    const k = r.sku.toLowerCase();
    if (countBySku.get(k) > 1) {
      return { ...r, status: "duplicate-file" };
    }
    if (existingBySku.has(k)) {
      return { ...r, status: "duplicate-existing", existingId: existingBySku.get(k).id };
    }
    return { ...r, status: "new" };
  });
}
