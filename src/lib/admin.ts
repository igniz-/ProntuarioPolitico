import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "pp_admin";

export function createAdminSession() {
  const token = process.env.ADMIN_TOKEN;
  const secret = process.env.ADMIN_SESSION_SECRET ?? token;
  return token && secret ? createHmac("sha256", secret).update(token).digest("hex") : "";
}

export function isValidAdminSession(value: string | undefined) {
  const expected = createAdminSession();
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function isValidAdminToken(value: unknown) {
  const expected = process.env.ADMIN_TOKEN;
  if (typeof value !== "string" || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function hasAdminConfiguration() {
  return Boolean(process.env.ADMIN_TOKEN);
}