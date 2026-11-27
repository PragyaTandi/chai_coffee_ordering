import { createHmac, timingSafeEqual } from "node:crypto";
import { defineActionErrors, type ActionRunContext } from "@agent-native/core/action";
import { readDeployCredentialEnv } from "@agent-native/core/server";

const COOKIE_NAME = "after_hours_staff";
const STAFF_PASSWORD_KEY = "STAFF_PASSWORD";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
export const staffActionErrors = defineActionErrors("staff_access_required");

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(expires: string, secret: string) {
  return createHmac("sha256", secret).update(`after-hours-staff:${expires}`).digest("base64url");
}

function staffPassword() {
  return readDeployCredentialEnv(STAFF_PASSWORD_KEY);
}

export async function isStaffConfigured() {
  const password = staffPassword();
  return Boolean(password && password.length >= 16);
}

export async function isValidStaffPassword(password: unknown) {
  const expected = staffPassword();
  if (typeof password !== "string" || !expected || expected.length < 16) return false;
  return safeEqual(password, expected);
}

export async function createStaffCookie(secure: boolean) {
  const secret = staffPassword();
  if (!secret || secret.length < 16) return null;
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS);
  const signature = sign(expires, secret);
  return `${COOKIE_NAME}=${expires}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearStaffCookie(secure: boolean) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}`;
}

export async function hasStaffSession(headers?: Headers) {
  if (!headers) return false;
  const secret = staffPassword();
  if (!secret || secret.length < 16) return false;
  const value = headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  const [expires, signature, extra] = value?.split(".") ?? [];
  if (!expires || !signature || extra || !/^\d+$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = sign(expires, secret);
  return safeEqual(signature, expected);
}

export async function requireStaff(context?: ActionRunContext) {
  if (!(await hasStaffSession(context?.requestHeaders))) {
    staffActionErrors.noWrite("Staff access required.", "staff_access_required", {
      statusCode: 403,
    });
  }
}
