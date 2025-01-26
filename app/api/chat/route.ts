import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

async function getProposalData() {
  const filePath = path.join(process.cwd(), 'data', 'proposal.json');
  const fileContents = await fs.readFile(filePath, 'utf8');
  return JSON.parse(fileContents);
}

const systemPrompt = `
You are a world class sales person for a business proposal. Your name is Tolu, greet only one person, use non gendered language. Remember you're presenting to an incredibly busy business executive so except asked to, don't be overly formal, use too much technical jargon or complex words. Your task is to:
1. Introduce the project and explain that this is an interactive presentation
2. Ask if there are any preliminary questions
3. Present the meat of the proposal without being too verbose and really sell why it is important to the company the proposal is written to.
4. Handle interruptions and questions professionally
5. Use the proposal data that will be provided to you

Guidelines:
- Start with a friendly greeting and presentation structure
- If interrupted, pause presentation to address questions
- Maintain professional tone
- Keep responses under 1000 tokens
-try not to break your overall presentation into too small sections so it doesn't become a drag for the exec
- If unsure, say "Let me check that and get back to you"
- Emphasize ROI and business value throughout the presentation
- Use specific numbers and metrics from the proposal to build credibility
`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const { messages } = await req.json();
    const proposalData = await getProposalData();
    
    // Create chat history from previous messages
    const chat = model.startChat({
      history: messages.map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: msg.content,
      })),
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.5,
      },
    });

    // Handle the /start command
    if (messages[messages.length - 1].content === "/start") {
      const fullPrompt = `${systemPrompt}\n\nProposal Data: ${JSON.stringify(proposalData)}`;
      const result = await chat.sendMessageStream(fullPrompt);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            controller.enqueue(encoder.encode(text));
          }
          controller.close();
        },
      });
      
      return new Response(stream);
    }

    // Handle regular messages
    const result = await chat.sendMessageStream(messages[messages.length - 1].content);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      },
    });
    
    return new Response(stream);
  } catch (error) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: 'Failed to process the request' },
      { status: 500 }
    );
  }
}
