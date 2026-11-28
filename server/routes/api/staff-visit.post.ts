import { defineEventHandler, getHeader, getRequestURL, setResponseHeader, setResponseStatus } from "h3";
import { clearStaffCookie, createStaffSessionCookie, hasStaffEntryGrant } from "../../staff-auth";

export default defineEventHandler(async (event) => {
  const origin = getHeader(event, "origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const requestOrigin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin;
      sameOrigin = new URL(origin).origin === requestOrigin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      setResponseStatus(event, 403);
      setResponseHeader(event, "Cache-Control", "no-store");
      return { entryAuthorized: false };
    }
  }

  const requestHeaders = new Headers();
  const cookie = getHeader(event, "cookie");
  if (cookie) requestHeaders.set("cookie", cookie);

  const secure = process.env.NODE_ENV === "production";
  const hasEntryGrant = await hasStaffEntryGrant(requestHeaders);
  const sessionCookie = hasEntryGrant ? await createStaffSessionCookie(secure) : null;
  const entryAuthorized = Boolean(sessionCookie);
  setResponseHeader(event, "Set-Cookie", sessionCookie ?? clearStaffCookie(secure));
  setResponseHeader(event, "Cache-Control", "no-store");
  return { entryAuthorized };
});
