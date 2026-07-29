import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TEMPLATES = [
  { id: "flow-basic", title: "Decision flowchart", category: "flowchart" },
  { id: "flow-approval", title: "Approval workflow", category: "flowchart" },
  { id: "flow-swimlane", title: "Swimlane flowchart", category: "flowchart" },
  { id: "freeform-board", title: "Brainstorm board", category: "freeform" },
  { id: "freeform-mindmap", title: "Product mind map", category: "freeform" },
  { id: "erd-workspace", title: "Workspace data model", category: "erd" },
  { id: "erd-ecommerce", title: "eCommerce data model", category: "erd" },
  { id: "erd-helpdesk", title: "IT help desk model", category: "erd" },
  { id: "banking-erd", title: "Banking data model", category: "erd" },
  { id: "seq-client-server", title: "Client · Server · Service", category: "sequence" },
  { id: "docker-arch", title: "Docker architecture", category: "architecture" },
  { id: "aws-cicd", title: "AWS CI/CD pipeline", category: "cloud" },
  { id: "azure-baseline", title: "Azure baseline", category: "cloud" },
  { id: "microservices", title: "Microservices platform", category: "architecture" },
] as const;

const ICON_CATEGORIES = ["custom", "general", "diagram", "tech", "cloud"] as const;

const server = new McpServer({
  name: "draw-app",
  version: "1.0.0",
});

server.tool(
  "list_templates",
  "List DrawApp diagram catalog templates (flowchart, ERD, cloud, freeform, sequence).",
  {
    category: z
      .enum(["all", "flowchart", "freeform", "erd", "sequence", "cloud", "architecture"])
      .optional()
      .describe("Optional category filter"),
  },
  async ({ category }) => {
    const items =
      !category || category === "all"
        ? TEMPLATES
        : TEMPLATES.filter((item) => item.category === category);
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
    };
  },
);

server.tool(
  "get_template",
  "Get one DrawApp template by id.",
  {
    id: z.string().describe("Template id, e.g. flow-basic or docker-arch"),
  },
  async ({ id }) => {
    const template = TEMPLATES.find((item) => item.id === id);
    if (!template) {
      return {
        content: [{ type: "text", text: `Template not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...template,
              usage: `Create a file in the DrawApp dashboard, open /board/<id>, then insert from Diagram Catalog → ${template.title}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "create_board_stub",
  "Create a board JSON stub that DrawApp can import or hydrate.",
  {
    name: z.string().default("Untitled File"),
    templateId: z.string().optional().describe("Optional catalog template id to attach"),
  },
  async ({ name, templateId }) => {
    const template = templateId ? TEMPLATES.find((item) => item.id === templateId) : null;
    const stub = {
      id: `mcp-${Date.now().toString(36)}`,
      name,
      createdAt: new Date().toISOString(),
      templateId: template?.id ?? null,
      content: {
        canvasName: name,
        pan: { x: 0, y: 0 },
        backgroundColor: "#f7f7fb",
        elements: [],
        note: template
          ? `Open DrawApp Diagram Catalog and insert "${template.title}"`
          : "Open DrawApp and start drawing",
      },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(stub, null, 2) }],
    };
  },
);

server.tool(
  "list_icon_categories",
  "List DrawApp icon library categories.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(ICON_CATEGORIES, null, 2) }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("draw-app MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal MCP server error:", error);
  process.exit(1);
});
