import { NextRequest, NextResponse } from "next/server";
import { getServerProxyHeaders } from "@/lib/server-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getServerProxyHeaders();
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  const lastEventId = req.headers.get("last-event-id");
  const upstreamHeaders: Record<string, string> = { ...ctx.headers };
  if (lastEventId) {
    upstreamHeaders["Last-Event-ID"] = lastEventId;
  }

  const upstream = await fetch(`${ctx.baseUrl}/runs/${encodeURIComponent(id)}/events`, {
    headers: upstreamHeaders,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Failed to connect to run event stream" },
      { status: upstream.status || 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
