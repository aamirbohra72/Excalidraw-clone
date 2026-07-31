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

const STYLE_RULES = `
Visual style (required — Eraser / colorful software-diagram quality):
- SHORT labels only: node text max 3 words / ~20 characters (e.g. "Order Service", "Redis", "Kafka").
- Edge labels max 2 words (e.g. "Publish", "Retry", "Yes", "No"). Never write long sentences on edges.
- Prefer rounded rectangles Node["Label"] for services. Do NOT use cylinder shapes [(Label)] — they clip text.
- Use diamonds {} for decisions, stadium (["Start"]) for start/end.
- Use colorful subgraphs for layers (Clients, Services, Data) with clear titles.
- Prefer software-engineering naming (Auth Service, Order API, Postgres, Redis, Kafka).
- Do NOT include classDef or class lines (the app applies a pastel multi-shade theme).
- Do NOT wrap in markdown fences.
- Return ONLY valid Mermaid code.
`.trim();

const FORMAT_INSTRUCTIONS: Record<Exclude<DiagramFormat, "document">, string> = {
  architecture: `
Create a Mermaid flowchart TD system architecture diagram (Eraser-style: pastel groups, white nodes, short labels).
Include clients, API/gateway, services, and data stores.
Use subgraphs for layers (Clients, Services, Data).
Every node label must be fully visible — keep names short ("Order Service" not a paragraph).
8–12 nodes, polished and colorful.
${STYLE_RULES}
`.trim(),
  flowchart: `
Create a Mermaid flowchart TD process diagram like Eraser: readable boxes, short labels, clear Yes/No decisions.
Include start, decisions, alternate paths, and success end.
8–14 nodes. Labels must not overflow boxes.
${STYLE_RULES}
`.trim(),
  erd: `
Create a Mermaid erDiagram for a realistic software data model (SaaS, social, ecommerce, or similar).
Rules:
- 4–7 entities with concise names (users, tweets, orders, …).
- Each entity block lists 3–6 attributes with types (string, number, boolean, timestamp) and PK/FK markers.
- Include relationships with crow's-foot style (||--o{, }o--||, etc.) and short labels.
- Prefer Prisma / SQL style field names (id, userId, createdAt).
Return ONLY Mermaid erDiagram code (no classDef, no markdown fences).
`.trim(),
  sequence: `
Create a Mermaid sequenceDiagram for a realistic software interaction (auth, checkout, API call, password reset).
Use 3–6 participants with SHORT names (Browser, WebApp, Auth, DB).
Message text max ~6 words so it stays fully visible.
Include request/response arrows and one alt/opt for success vs failure.
Return ONLY Mermaid sequenceDiagram code.
`.trim(),
  bpmn: `
Create a Mermaid flowchart TB BPMN-style process with swimlane subgraphs (Eraser quality).
CRITICAL syntax rules:
- Use: flowchart TB
- Each lane is: subgraph LaneId["Lane Name"] ... end
- Put tasks inside lanes as Node["Short Label"]
- Use diamonds Node{"Decision?"} for gateways
- Connect across lanes with --> edges AFTER the subgraph blocks if needed
- SHORT labels only (2–3 words). No cylinder shapes.
- 3 lanes, 8–12 nodes total. Colorful and readable.
Example shape (follow this pattern):
flowchart TB
  subgraph Applicant["Applicant"]
    A(["Start"]) --> B["Submit App"]
  end
  subgraph Underwriting["Underwriting"]
    C["Review"] --> D{"Approve?"}
  end
  subgraph Compliance["Compliance"]
    E["KYC Check"] --> F(["Done"])
  end
  B --> C
  D -->|Yes| E
  D -->|No| A
${STYLE_RULES}
`.trim(),
};

function systemFor(mode: "text" | "mermaid", format?: DiagramFormat) {
  if (mode === "mermaid") {
    return `You are a Mermaid expert. Fix and improve the user's Mermaid diagram for clarity, layout, and Eraser-quality polish. ${STYLE_RULES}`;
  }
  if (format && format !== "document" && FORMAT_INSTRUCTIONS[format]) {
    return `You are a diagram design assistant that creates Eraser-quality software engineering diagrams.\n${FORMAT_INSTRUCTIONS[format]}`;
  }
  return `You are a diagram design assistant. Convert the user request into a clear Mermaid flowchart.\n${STYLE_RULES}`;
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
              temperature: 0.35,
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
