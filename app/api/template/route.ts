import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

import { basePrompt as nodeBasePrompt } from "@/app/lib/defaults/node";
import { basePrompt as reactBasePrompt } from "@/app/lib/defaults/react";
import { BASE_PROMPT } from "@/app/lib/prompt";


const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_API_KEY!);

export async function POST(req: NextRequest) {
    try{
    const body = await req.json();
    const prompt = body.prompt;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `System: Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra.\n\nUser: ${prompt}`,
              },
            ],
          },
        ],
        
      });
    if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0) {
      console.error("Unexpected response format:", result);
      return NextResponse.json(
        { message: "Unexpected response from Gemini", result },
        { status: 500 }
      );
    }
      const answer = result?.response?.candidates[0]?.content.parts[0].text;

    console.log("Answer from Gemini:", answer);
    if (answer === "react") {
      return NextResponse.json({
        prompts: [
          BASE_PROMPT,
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [reactBasePrompt],
      });
    }

    if (answer === "node") {
      return NextResponse.json({
        prompts: [
          `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
        ],
        uiPrompts: [nodeBasePrompt],
      });
    }

    return NextResponse.json(
      { message: "You can't access this" },
      { status: 403 }
    );
  } catch (error) {
    console.error("Error in /template route:", error);
    return NextResponse.json(
      { message: "Server error", error: error },
      { status: 500 }
    );
  }
}