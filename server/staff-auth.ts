import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { defineActionErrors, type ActionRunContext } from "@agent-native/core/action";
import { readDeployCredentialEnv } from "@agent-native/core/server";

const COOKIE_NAME = "after_hours_staff";
const STAFF_PASSWORD_KEY = "STAFF_PASSWORD";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const ENTRY_LIFETIME_SECONDS = 60;
export const staffActionErrors = defineActionErrors("staff_access_required");

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(expires: string, secret: string) {
  return createHmac("sha256", secret).update(`after-hours-staff:${expires}`).digest("base64url");
}

function signEntry(expires: string, nonce: string, secret: string) {
  return createHmac("sha256", secret).update(`after-hours-staff-entry:${expires}:${nonce}`).digest("base64url");
}

function cookieValue(headers: Headers | undefined, name: string) {
  return headers?.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function staffPassword() {
  return readDeployCredentialEnv(STAFF_PASSWORD_KEY);
}

function validStaffCookie(headers?: Headers) {
  const secret = staffPassword();
  if (!headers || !secret || secret.length < 16) return null;
  const parts = cookieValue(headers, COOKIE_NAME)?.split(".") ?? [];
  const [expires, signature] = parts;
  if ((parts.length !== 2 && parts.length !== 5) || !expires || !signature || !/^\d+$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  if (!safeEqual(signature, sign(expires, secret))) return null;
  return { parts, secret };
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
  const entryExpires = String(Math.floor(Date.now() / 1000) + ENTRY_LIFETIME_SECONDS);
  const nonce = randomBytes(16).toString("base64url");
  const signature = sign(expires, secret);
  const entrySignature = signEntry(entryExpires, nonce, secret);
  return `${COOKIE_NAME}=${expires}.${signature}.${entryExpires}.${nonce}.${entrySignature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function createStaffSessionCookie(secure: boolean) {
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
  return validStaffCookie(headers)?.parts.length === 2;
}

export async function hasStaffEntryGrant(headers?: Headers) {
  const staffCookie = validStaffCookie(headers);
  if (!staffCookie || staffCookie.parts.length !== 5) return false;
  const { parts, secret } = staffCookie;
  const [, , expires, nonce, signature] = parts;
  if (!expires || !nonce || !signature || !/^\d+$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, signEntry(expires, nonce, secret));
}

export async function requireStaff(context?: ActionRunContext) {
  if (!(await hasStaffSession(context?.requestHeaders))) {
    staffActionErrors.noWrite("Staff access required.", "staff_access_required", {
      statusCode: 403,
    });
  }
}
