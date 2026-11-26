import { NextRequest, NextResponse } from "next/server";
import { getServerProxyHeaders } from "@/lib/server-proxy";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getServerProxyHeaders();
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  const upstream = await fetch(`${ctx.baseUrl}/runs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: ctx.headers,
  });

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
