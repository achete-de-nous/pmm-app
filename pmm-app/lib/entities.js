// Registry of every data collection stored in Redis.
// `label` = human name used in audit log sentences.
// `nameField` = which field to show in "X created/updated <nameField>" sentences.
// `softDelete` = true -> DELETE sets active:false instead of removing the key.
// `immutable` = true -> record can never be edited/deleted once created (history tables).

export const ENTITIES = {
  users: { label: "User", nameField: "name", softDelete: true },
  articles: { label: "Article", nameField: "name", softDelete: true },
  finishedInitialBalances: { label: "Initial Finished Product Balance", nameField: "articleName", immutable: false },
  weeklySales: { label: "Weekly Sales", nameField: "week", immutable: true },
  materials: { label: "Material", nameField: "name", softDelete: true },
  materialInitialBalances: { label: "Initial Material Balance", nameField: "materialName", immutable: false },
  materialTransactions: { label: "Material Transaction", nameField: "materialName", immutable: true },
  vendors: { label: "Vendor", nameField: "name", softDelete: true },
  productionPlans: { label: "Production Plan", nameField: "articleName", immutable: false },
  cogsHistory: { label: "COGS History", nameField: "articleName", immutable: true },
  reconciliations: { label: "Reconciliation", nameField: "materialName", immutable: true },
  auditHistory: { label: "Audit History", nameField: "summary", immutable: true },
  settings: { label: "Settings", nameField: "key", immutable: false },
};

export function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, type);
}
