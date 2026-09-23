// Registry of every data collection stored in Redis.
// `label` = human name used in audit log sentences.
// `nameField` = which field to show in "X created/updated <nameField>" sentences.
// `softDelete` = true -> DELETE sets active:false instead of removing the key.
//                false -> DELETE really removes the record (hard delete).
// `immutable` = true -> record can never be edited/deleted once created (history tables).

export const ENTITIES = {
  users: { label: "User", nameField: "name", softDelete: true },
  articles: { label: "Article", nameField: "name", softDelete: true },
  finishedInitialBalances: { label: "Initial Finished Product Balance", nameField: "articleName", immutable: false },
  weeklySales: { label: "Weekly Sales", nameField: "week", immutable: true },
  materials: { label: "Material", nameField: "name", softDelete: true },
  materialCategories: { label: "Fabric Category", nameField: "name", softDelete: false },
  materialTransactions: { label: "Material Transaction", nameField: "materialName", immutable: true },
  vendors: { label: "Vendor", nameField: "name", softDelete: false },
  vendorTypes: { label: "Vendor Type", nameField: "name", softDelete: false },
  products: { label: "Product", nameField: "productName", softDelete: false },
  productionPlans: { label: "Production Plan", nameField: "articleName", immutable: false },
  cogsRecords: { label: "COGS", nameField: "productName", immutable: false },
  reconciliations: { label: "Reconciliation", nameField: "materialName", immutable: true },
  auditHistory: { label: "Audit History", nameField: "summary", immutable: true },
  settings: { label: "Settings", nameField: "key", immutable: false },
};

export function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, type);
}
