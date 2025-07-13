// app/api/stream/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "edge"; // Required for streaming

export async function POST(req: Request): Promise<Response> {
  const { prompt } = await req.json();

  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (!apiKey) return new Response("API key missing", { status: 500 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ""; // Buffer to accumulate text chunks

      for await (const chunk of result.stream) {
        const text = chunk.text();
        buffer += text;

        // Split the buffer into lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

        // Enqueue each complete line
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n"));
        }
      }

      // Enqueue any remaining text in the buffer
      if (buffer) {
        controller.enqueue(encoder.encode(buffer + "\n"));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
