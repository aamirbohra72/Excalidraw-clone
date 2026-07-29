import { NextResponse } from "next/server";

type DiagramFormat =
  | "architecture"
  | "flowchart"
  | "erd"
  | "sequence"
  | "bpmn"
  | "document";

type DiagramRequest = {
  mode?: "text" | "mermaid";
  prompt?: string;
  format?: DiagramFormat;
};

type Provider = "mistral" | "openai";

const FORMAT_INSTRUCTIONS: Record<Exclude<DiagramFormat, "document">, string> = {
  architecture:
    "Create a Mermaid flowchart TD architecture diagram with clear system/service boxes and labeled connections. Prefer subgraphs for layers (clients, services, data).",
  flowchart:
    "Create a Mermaid flowchart TD process diagram with decisions (Yes/No), start/end nodes, and clear step labels.",
  erd:
    "Create a Mermaid erDiagram with entities, attributes, and relationships (1:N, N:M) using realistic field names.",
  sequence:
    "Create a Mermaid sequenceDiagram with actors/participants and numbered-style message flow for a realistic interaction.",
  bpmn:
    "Create a Mermaid flowchart LR BPMN-style process with swimlane-like subgraphs (or clear role groups), start/end events, tasks, and gateways.",
};

function systemFor(mode: "text" | "mermaid", format?: DiagramFormat) {
  if (mode === "mermaid") {
    return "You are a Mermaid expert. Fix and improve the user's Mermaid diagram. Return ONLY valid Mermaid code with no markdown fences.";
  }
  if (format && format !== "document" && FORMAT_INSTRUCTIONS[format]) {
    return `You are a diagram assistant. ${FORMAT_INSTRUCTIONS[format]} Return ONLY valid Mermaid code with no markdown fences and no commentary.`;
  }
  return "You are a diagram assistant. Convert the user request into a clear Mermaid flowchart. Return ONLY valid Mermaid code with no markdown fences.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiagramRequest;
    const mode = body.mode ?? "text";
    const prompt = body.prompt?.trim();
    const format = body.format;

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

    const systemInstruction = systemFor(mode, format);
    const userContent =
      format && format !== "document"
        ? `Format: ${format}\n\nUser request:\n${prompt}`
        : prompt;

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
                { role: "user", content: userContent },
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
                { role: "user", content: [{ type: "text", text: userContent }] },
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

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
    };
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

    return NextResponse.json({ mermaid, format: format ?? "flowchart", provider });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error", details: String(error) },
      { status: 500 },
    );
  }
}
