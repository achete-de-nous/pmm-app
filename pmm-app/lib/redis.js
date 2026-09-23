import { Redis } from "@upstash/redis";

// The Vercel Marketplace Upstash integration and Upstash's own dashboard use
// slightly different env var names depending on how it was connected. We
// check both conventions so the app works either way without extra manual
// configuration.
const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = new Redis({ url, token });
