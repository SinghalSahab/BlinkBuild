import {  getSystemPrompt } from "@/app/lib/prompt";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_API_KEY!);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash" // or "gemini-2.5-flash" if you want faster but lighter responses
  });
  
  const systemPrompt = getSystemPrompt();
  

export async function POST(req: NextRequest) {
    try{
    
        const body = await req.json();
        const messages = body.messages;
        const contents = [];

        if (systemPrompt) {
          contents.push({
            role: "user",
            parts: [{ text: systemPrompt }]
          });
        }

        for (const msg of messages) {
            contents.push({
              role: msg.role,
              parts: [{ text: msg.content }]
            });
          }
    

    const result = await model.generateContent({
        contents
        
      });
    
      
    
      const output = await result.response.text();

    return NextResponse.json({
      response: output
    });
  } catch (error) {
    console.error("Error in /template route:", error);
    return NextResponse.json(
      { message: "Server error", error: error },
      { status: 500 }
    );
  }
}