import { NextResponse } from "next/server";

type DiagramRequest = {
  mode?: "text" | "mermaid";
  prompt?: string;
};

type Provider = "mistral" | "openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiagramRequest;
    const mode = body.mode ?? "text";
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const provider: Provider = process.env.MISTRAL_API_KEY ? "mistral" : "openai";
    const mistralKey = process.env.MISTRAL_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (provider === "mistral" && !mistralKey) {
      return NextResponse.json({ error: "Missing MISTRAL_API_KEY" }, { status: 500 });
    }
    if (provider === "openai" && !openaiKey) {
      return NextResponse.json(
        {
          error:
            "Missing MISTRAL_API_KEY or OPENAI_API_KEY. Add one in apps/web/.env.local before using Text to diagram.",
        },
        { status: 500 },
      );
    }

    const systemInstruction =
      mode === "mermaid"
        ? "You are a Mermaid expert. Fix and improve the user's Mermaid diagram. Return ONLY valid Mermaid code with no markdown fences."
        : "You are a diagram assistant. Convert the user request into a clear Mermaid flowchart. Return ONLY valid Mermaid code with no markdown fences.";

    const response =
      provider === "mistral"
        ? await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${mistralKey}`,
            },
            body: JSON.stringify({
              model: "mistral-small-latest",
              temperature: 0.2,
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt },
              ],
            }),
          })
        : await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              input: [
                { role: "system", content: [{ type: "text", text: systemInstruction }] },
                { role: "user", content: [{ type: "text", text: prompt }] },
              ],
            }),
          });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { error: "Model request failed", details },
        { status: response.status },
      );
    }

    const json = (await response.json()) as any;
    const mermaid =
      provider === "mistral"
        ? String(json?.choices?.[0]?.message?.content ?? "").trim()
        : String(json?.output_text ?? "").trim();

    if (!mermaid) {
      return NextResponse.json(
        { error: "No diagram generated. Please try a clearer prompt." },
        { status: 500 },
      );
    }

    return NextResponse.json({ mermaid });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error", details: String(error) },
      { status: 500 },
    );
  }
}
