import { NextResponse } from "next/server";

type DocsRequest = {
  canvasName?: string;
  architectureSummary?: string;
  existingNotes?: string;
  focus?: string;
  prompt?: string;
};

type Provider = "mistral" | "openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DocsRequest;
    const canvasName = body.canvasName?.trim() || "Untitled architecture";
    const architectureSummary = body.architectureSummary?.trim() || "";
    const existingNotes = body.existingNotes?.trim() || "";
    const focus = body.focus?.trim() || "";
    const prompt = body.prompt?.trim() || "";

    if (!architectureSummary && !prompt) {
      return NextResponse.json(
        {
          error:
            "Provide a prompt describing the document, or a canvas architecture summary.",
        },
        { status: 400 },
      );
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
            "Missing MISTRAL_API_KEY or OPENAI_API_KEY. Add one in apps/web/.env.local before generating docs.",
        },
        { status: 500 },
      );
    }

    const systemInstruction = `You are a senior software architect and technical writer.
Write clear architecture / product documentation in Markdown.

Rules:
- If a canvas summary is provided, ground the doc in that summary.
- If only a prompt is provided, write a useful architecture/document draft from the request.
- Prefer practical sections: One-liner summary, Overview, Components, Data flow / process, Key decisions, Risks / open questions, Next steps.
- Keep it concise, scannable, and professional.
- Return ONLY Markdown (no code fences wrapping the whole document).`;

    const userPrompt = [
      `Board title: ${canvasName}`,
      focus ? `Documentation focus: ${focus}` : null,
      prompt ? `User request:\n${prompt}` : null,
      existingNotes
        ? `Existing document notes (merge/improve, do not discard useful content):\n${existingNotes}`
        : null,
      architectureSummary ? `Canvas architecture summary:\n${architectureSummary}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

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
              temperature: 0.3,
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: userPrompt },
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
                { role: "user", content: [{ type: "text", text: userPrompt }] },
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

    const markdown =
      provider === "mistral"
        ? String(json?.choices?.[0]?.message?.content ?? "").trim()
        : String(json?.output_text ?? "").trim();

    if (!markdown) {
      return NextResponse.json(
        { error: "No documentation generated. Try a clearer prompt." },
        { status: 500 },
      );
    }

    return NextResponse.json({ markdown, provider });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error", details: String(error) },
      { status: 500 },
    );
  }
}
