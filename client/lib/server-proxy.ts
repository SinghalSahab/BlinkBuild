import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function getServerProxyHeaders(): Promise<
  | { ok: true; baseUrl: string; headers: Record<string, string> }
  | { ok: false; response: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const baseUrl = (process.env.BLINKBUILD_SERVER_URL || "http://localhost:8000").replace(/\/$/, "");
  const secret = process.env.BLINKBUILD_SERVER_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server integration is not configured (BLINKBUILD_SERVER_SECRET missing)" },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true,
    baseUrl,
    headers: {
      "X-BlinkBuild-Secret": secret,
      "X-Clerk-User-Id": userId,
    },
  };
}
