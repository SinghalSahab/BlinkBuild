import { NextRequest, NextResponse } from "next/server";
import { getServerProxyHeaders } from "@/lib/server-proxy";

export async function POST(req: NextRequest) {
  const ctx = await getServerProxyHeaders();
  if (!ctx.ok) return ctx.response;

  const body = await req.json();
  const upstream = await fetch(`${ctx.baseUrl}/runs`, {
    method: "POST",
    headers: {
      ...ctx.headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
