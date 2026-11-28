import { Staff, StaffDailyReport } from "@/components/cafe";
import {
  clearStaffCookie,
  createStaffCookie,
  isStaffConfigured,
  isValidStaffPassword,
} from "../../server/staff-auth";
import { appPath } from "@agent-native/core/client/api-path";
import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs } from "react-router";

function isStaffVisitResult(value: unknown): value is { entryAuthorized: boolean } {
  return typeof value === "object" && value !== null && "entryAuthorized" in value && typeof value.entryAuthorized === "boolean";
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const secure = process.env.NODE_ENV === "production";
  const intent = form.get("intent");
  if (intent === "logout") {
    const headers = new Headers({ Location: "/staff" });
    headers.append("Set-Cookie", clearStaffCookie(secure));
    return new Response(null, { status: 303, headers });
  }
  if (!(await isStaffConfigured())) {
    return new Response(null, { status: 303, headers: { Location: "/staff?setup=1" } });
  }
  if (!(await isValidStaffPassword(form.get("password")))) {
    return new Response(null, { status: 303, headers: { Location: "/staff?error=1" } });
  }
  const cookie = await createStaffCookie(secure);
  if (!cookie) return new Response(null, { status: 303, headers: { Location: "/staff?setup=1" } });
  const headers = new Headers({ Location: "/staff" });
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export default function StaffRoute() {
  const [entryAuthorized, setEntryAuthorized] = useState<boolean | null>(null);
  const [entryCheckFailed, setEntryCheckFailed] = useState(false);
  const visitRequest = useRef<Promise<{ entryAuthorized: boolean }> | null>(null);

  useEffect(() => {
    let active = true;
    if (!visitRequest.current) {
      visitRequest.current = fetch(appPath("/api/staff-visit"), { method: "POST" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Staff access check failed (${response.status}).`);
          const result: unknown = await response.json();
          if (!isStaffVisitResult(result)) throw new Error("Staff access check returned an invalid response.");
          return result;
        });
    }
    void visitRequest.current
      .then((result) => {
        if (active) setEntryAuthorized(result.entryAuthorized);
      })
      .catch(() => {
        if (active) setEntryCheckFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (entryCheckFailed) {
    return <main className="staff-login-page"><div className="staff-login-card" role="alert">Couldn’t verify staff access. Refresh to try again.</div></main>;
  }
  if (entryAuthorized === null) {
    return <main className="staff-login-page"><div className="staff-login-card">Checking staff access…</div></main>;
  }

  return (
    <>
      <Staff entryAuthorized={entryAuthorized} />
      <StaffDailyReport entryAuthorized={entryAuthorized} />
    </>
  );
}
