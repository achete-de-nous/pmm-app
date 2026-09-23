import { redis } from "./redis";

const settingKey = (k) => `setting:${k}`;

export async function getSetting(key, fallback) {
  const raw = await redis.get(settingKey(key));
  if (raw == null) return fallback;
  return typeof raw === "string" ? raw : raw;
}

export async function setSetting(key, value) {
  await redis.set(settingKey(key), value);
  return value;
}

export async function getPin() {
  return (await getSetting("pin", "1234")).toString();
}

export async function setPin(newPin) {
  await setSetting("pin", newPin.toString());
}
