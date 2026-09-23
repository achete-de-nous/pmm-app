import { redis } from "./redis";
import { ENTITIES } from "./entities";

function recKey(type, id) {
  return `rec:${type}:${id}`;
}
function idxKey(type) {
  return `idx:${type}`;
}

function newId() {
  return crypto.randomUUID();
}

function parse(raw) {
  if (raw == null) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function listRecords(type, { includeInactive = false } = {}) {
  const ids = await redis.smembers(idxKey(type));
  if (!ids || ids.length === 0) return [];
  const raws = await Promise.all(ids.map((id) => redis.get(recKey(type, id))));
  let records = raws.map(parse).filter(Boolean);
  if (!includeInactive && ENTITIES[type]?.softDelete) {
    records = records.filter((r) => r.active !== false);
  }
  // newest first by createdAt when available
  records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return records;
}

export async function getRecord(type, id) {
  const raw = await redis.get(recKey(type, id));
  return parse(raw);
}

export async function createRecord(type, data, user) {
  const id = newId();
  const now = new Date().toISOString();
  const record = { ...data, id, active: true, createdAt: now, createdBy: user || "Unknown", updatedAt: now, updatedBy: user || "Unknown" };
  await redis.set(recKey(type, id), JSON.stringify(record));
  await redis.sadd(idxKey(type), id);
  await logAudit(type, "create", record, user, `${ENTITIES[type]?.label || type} "${record[ENTITIES[type]?.nameField] ?? id}" dibuat`);
  return record;
}

export async function updateRecord(type, id, patch, user) {
  if (ENTITIES[type]?.immutable) {
    throw new Error(`${ENTITIES[type].label} bersifat historical dan tidak dapat diedit.`);
  }
  const existing = await getRecord(type, id);
  if (!existing) throw new Error("Record not found");
  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, id, updatedAt: now, updatedBy: user || "Unknown" };
  await redis.set(recKey(type, id), JSON.stringify(updated));
  await logAudit(type, "update", updated, user, `${ENTITIES[type]?.label || type} "${updated[ENTITIES[type]?.nameField] ?? id}" diupdate`, existing);
  return updated;
}

export async function softDeleteRecord(type, id, user) {
  if (ENTITIES[type]?.immutable) {
    throw new Error(`${ENTITIES[type].label} bersifat historical dan tidak dapat dihapus.`);
  }
  if (!ENTITIES[type]?.softDelete) {
    // hard delete for non-soft-delete collections (vendors, products, vendorTypes, ...)
    const existing = await getRecord(type, id);
    await redis.del(recKey(type, id));
    await redis.srem(idxKey(type), id);
    await logAudit(type, "delete", existing, user, `${ENTITIES[type]?.label || type} "${existing?.[ENTITIES[type]?.nameField] ?? id}" dihapus`);
    return null;
  }
  return updateRecord(type, id, { active: false }, user);
}

export async function findByField(type, field, value) {
  const all = await listRecords(type, { includeInactive: true });
  return all.find((r) => (r[field] || "").toLowerCase() === (value || "").toLowerCase());
}

export async function logAudit(type, action, record, user, summary, before) {
  const id = newId();
  const now = new Date().toISOString();
  const entry = {
    id,
    active: true,
    createdAt: now,
    createdBy: user || "Unknown",
    updatedAt: now,
    updatedBy: user || "Unknown",
    entityType: type,
    action,
    recordId: record?.id,
    summary,
    user: user || "Unknown",
    timestamp: now,
    before: before || null,
    after: record || null,
  };
  await redis.set(recKey("auditHistory", id), JSON.stringify(entry));
  await redis.sadd(idxKey("auditHistory"), id);
}
