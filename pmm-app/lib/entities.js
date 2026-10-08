// Registry of every data collection stored in Redis.
// `label` = human name used in audit log sentences.
// `nameField` = which field to show in "X created/updated <nameField>" sentences.
// `softDelete` = true -> DELETE sets active:false instead of removing the key.
//                false -> DELETE really removes the record (hard delete).
// `immutable` = true -> record can never be edited/deleted once created (history tables).

export const ENTITIES = {
  users: { label: "User", nameField: "name", softDelete: true },
  materials: { label: "Material", nameField: "name", softDelete: true },
  materialCategories: { label: "Fabric Category", nameField: "name", softDelete: false },
  materialTransactions: { label: "Material Transaction", nameField: "materialName", immutable: false },
  trialBalanceHidden: { label: "Trial Balance Hidden Row", nameField: "rowKey", immutable: false },
  vendors: { label: "Vendor", nameField: "name", softDelete: false },
  vendorTypes: { label: "Vendor Type", nameField: "name", softDelete: false },
  products: { label: "Product", nameField: "productName", softDelete: false },
  productionPlans: { label: "Production Plan", nameField: "articleName", immutable: false },
  cogsRecords: { label: "COGS", nameField: "productName", softDelete: true, immutable: false },
  defectRecords: { label: "Defect Qty", nameField: "articleName", immutable: false },
  financeRecords: { label: "Finance", nameField: "articleName", immutable: false },
  reconciliations: { label: "Trial Balance Check", nameField: "materialName", immutable: false },
  auditHistory: { label: "Audit History", nameField: "summary", immutable: true },
  settings: { label: "Settings", nameField: "key", immutable: false },
};

export function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, type);
}
