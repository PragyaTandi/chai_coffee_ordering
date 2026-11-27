import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { hasStaffSession, isStaffConfigured } from "../server/staff-auth";

export default defineAction({
  description: "Check whether the current browser has an active staff session.",
  schema: z.object({ refresh: z.string().optional().describe("Non-secret value used to refresh the session check after sign-in or sign-out") }),
  http: { method: "GET" },
  requiresAuth: false,
  agentTool: false,
  persistInBrowser: false,
  run: async (_, context) => ({ configured: await isStaffConfigured(), authorized: await hasStaffSession(context?.requestHeaders) }),
});
