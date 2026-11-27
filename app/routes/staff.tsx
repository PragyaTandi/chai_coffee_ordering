import { Staff, StaffDailyReport } from "@/components/cafe";
import { createStaffCookie, clearStaffCookie, isStaffConfigured, isValidStaffPassword } from "../../server/staff-auth";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const secure = process.env.NODE_ENV === "production";
  if (form.get("intent") === "logout") {
    return new Response(null, { status: 303, headers: { Location: "/staff", "Set-Cookie": clearStaffCookie(secure) } });
  }
  if (!(await isStaffConfigured())) {
    return new Response(null, { status: 303, headers: { Location: "/staff?setup=1" } });
  }
  if (!(await isValidStaffPassword(form.get("password")))) {
    return new Response(null, { status: 303, headers: { Location: "/staff?error=1" } });
  }
  const cookie = await createStaffCookie(secure);
  if (!cookie) return new Response(null, { status: 303, headers: { Location: "/staff?setup=1" } });
  return new Response(null, { status: 303, headers: { Location: "/staff", "Set-Cookie": cookie } });
}

export default function StaffRoute() {
  return (
    <>
      <Staff />
      <StaffDailyReport />
    </>
  );
}
