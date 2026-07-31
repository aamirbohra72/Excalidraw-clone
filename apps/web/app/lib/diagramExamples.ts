export type DiagramExampleFormat =
  | "architecture"
  | "flowchart"
  | "erd"
  | "sequence"
  | "bpmn"
  | "document";

export type DiagramExample = {
  id: string;
  prompt: string;
};

const EXAMPLES: Record<DiagramExampleFormat, DiagramExample[]> = {
  erd: [
    {
      id: "erd-music",
      prompt:
        "Music streaming site data model with users, artists, albums, songs, and playlists in Prisma.",
    },
    {
      id: "erd-ecommerce",
      prompt:
        "eCommerce SQL schema with customers, products, orders, reviews, and inventory tables.",
    },
    {
      id: "erd-twitter",
      prompt:
        "Twitter-like social platform data model with users, tweets, follows, likes, and retweets.",
    },
    {
      id: "erd-ai-agent",
      prompt:
        "AI agent platform ERD with agents, tools, tool_calls, conversations, messages, and memory_items.",
    },
    {
      id: "erd-mcp",
      prompt:
        "MCP server registry data model with servers, tools, resources, prompts, clients, and sessions.",
    },
    {
      id: "erd-blockchain",
      prompt:
        "On-chain indexing ERD with wallets, transactions, tokens, transfers, and nft_collections.",
    },
    {
      id: "erd-hft",
      prompt:
        "HFT trading ERD with instruments, orders, fills, positions, risk_limits, and market_ticks.",
    },
  ],
  architecture: [
    {
      id: "arch-microservices",
      prompt:
        "Microservices e-commerce architecture with API gateway, auth, orders, payments, inventory, Postgres, and Redis.",
    },
    {
      id: "arch-event",
      prompt:
        "Event-driven order pipeline with Kafka, workers, notification service, and dead-letter queue.",
    },
    {
      id: "arch-saas",
      prompt:
        "Multi-tenant SaaS architecture with CDN, BFF, shared services, and per-tenant Postgres schemas.",
    },
    {
      id: "arch-ai-agent",
      prompt:
        "AI agent architecture: User → Orchestrator → Planner → Tool Router → MCP tools → Vector DB → LLM.",
    },
    {
      id: "arch-genai-rag",
      prompt:
        "GenAI RAG architecture with ingest pipeline, chunking, embeddings, vector store, retriever, and chat API.",
    },
    {
      id: "arch-mcp",
      prompt:
        "DrawApp MCP bridge: IDE client → MCP server → tools (diagram, docs, workspace) → Neon Postgres.",
    },
    {
      id: "arch-blockchain",
      prompt:
        "Blockchain indexer architecture: RPC nodes → ingest workers → decoder → Postgres → GraphQL API.",
    },
    {
      id: "arch-hft",
      prompt:
        "HFT stack: market data gateway, matching engine, risk check, order gateway, and monitoring.",
    },
  ],
  flowchart: [
    {
      id: "flow-cicd",
      prompt:
        "CI/CD release flowchart with build, unit tests, security scan, staging deploy, approval gate, and production.",
    },
    {
      id: "flow-onboarding",
      prompt:
        "User onboarding flow with signup, email verify, profile setup, team invite, and activation success.",
    },
    {
      id: "flow-feature-flag",
      prompt:
        "Feature flag rollout decision flow with canary, metrics check, full rollout, or rollback.",
    },
    {
      id: "flow-ai-agent",
      prompt:
        "AI agent tool-calling loop: receive goal, plan, call tool, observe, retry or finish with answer.",
    },
    {
      id: "flow-genai-eval",
      prompt:
        "GenAI evaluation flow: dataset → generate → score (faithfulness, toxicity) → gate → deploy or fix.",
    },
    {
      id: "flow-mcp-auth",
      prompt:
        "MCP tool invoke flow with auth check, schema validate, execute tool, and stream result to client.",
    },
    {
      id: "flow-blockchain-tx",
      prompt:
        "Blockchain tx flow: draft → gas estimate → sign → broadcast → confirm → index → notify.",
    },
    {
      id: "flow-hft-order",
      prompt:
        "HFT order flow: signal → risk checks → place order → partial fill → complete or cancel.",
    },
  ],
  sequence: [
    {
      id: "seq-oauth",
      prompt:
        "OAuth login sequence across Browser, WebApp, AuthService, and UserDB with token exchange.",
    },
    {
      id: "seq-checkout",
      prompt:
        "Checkout payment sequence: CartService, PaymentGateway, OrderService, and Inventory with failure path.",
    },
    {
      id: "seq-reset",
      prompt:
        "Password reset sequence with WebApp, Auth API, Email service, and Redis OTP store.",
    },
    {
      id: "seq-ai-agent",
      prompt:
        "AI agent sequence: User, Agent, LLM, MCP Tool Server, and VectorDB for a research question.",
    },
    {
      id: "seq-genai-rag",
      prompt:
        "RAG chat sequence: Client, API, Retriever, VectorDB, LLM with citation response.",
    },
    {
      id: "seq-mcp",
      prompt:
        "MCP tools/list and tools/call sequence between IDE, MCP Server, and Diagram API.",
    },
    {
      id: "seq-blockchain",
      prompt:
        "Wallet connect and token transfer sequence: DApp, Wallet, RPC Node, and Indexer.",
    },
    {
      id: "seq-hft",
      prompt:
        "HFT cancel-replace sequence between Strategy, Risk, Matching Engine, and Market Data.",
    },
  ],
  bpmn: [
    {
      id: "bpmn-fulfillment",
      prompt:
        "Order fulfillment BPMN across Sales, Warehouse, and Shipping lanes with approve/reject gateways.",
    },
    {
      id: "bpmn-incident",
      prompt:
        "Incident response process across On-call, Engineering, and Comms with escalation paths.",
    },
    {
      id: "bpmn-loan",
      prompt:
        "Loan approval BPMN with Applicant, Underwriting, and Compliance swimlanes.",
    },
    {
      id: "bpmn-ai-review",
      prompt:
        "GenAI content review BPMN across Author, AI Moderator, Human Reviewer, and Publisher.",
    },
    {
      id: "bpmn-mcp-release",
      prompt:
        "MCP server release BPMN across Dev, Security Review, Staging, and Production lanes.",
    },
    {
      id: "bpmn-blockchain-listing",
      prompt:
        "Token listing BPMN across Issuer, Compliance, Exchange Ops, and Market Making.",
    },
    {
      id: "bpmn-hft-incident",
      prompt:
        "HFT trading halt BPMN across Risk, Trading Desk, SRE, and Compliance with restart gate.",
    },
  ],
  document: [
    {
      id: "doc-realtime",
      prompt:
        "Write architecture documentation for a realtime collaborative whiteboard with rooms and WebSockets.",
    },
    {
      id: "doc-payments",
      prompt:
        "Document a payments platform covering services, data stores, failure modes, and SLOs.",
    },
    {
      id: "doc-auth",
      prompt:
        "Write auth & session design notes for OAuth, refresh tokens, and RBAC across microservices.",
    },
    {
      id: "doc-ai-agent",
      prompt:
        "Document an AI agent platform: orchestration, tool use via MCP, memory, evals, and safety rails.",
    },
    {
      id: "doc-genai-rag",
      prompt:
        "Write a GenAI RAG design doc covering ingest, chunking, retrieval quality, and cost controls.",
    },
    {
      id: "doc-mcp",
      prompt:
        "Document DrawApp MCP server tools, auth model, and how IDE agents create diagrams.",
    },
    {
      id: "doc-blockchain",
      prompt:
        "Write an indexing pipeline design for Ethereum transfers with reorg handling.",
    },
    {
      id: "doc-hft",
      prompt:
        "Document an HFT risk and matching architecture with latency budgets and failure modes.",
    },
  ],
};

export const DIAGRAM_FORMAT_LABELS: Record<DiagramExampleFormat, string> = {
  architecture: "Architecture",
  flowchart: "Flow Chart",
  erd: "Entity Relationship",
  sequence: "Sequence",
  bpmn: "BPMN",
  document: "Document",
};

export const DIAGRAM_COMPOSER_PLACEHOLDERS: Record<DiagramExampleFormat, string> = {
  architecture: "Create an architecture diagram:",
  flowchart: "Create a flow chart:",
  erd: "Create an entity relationship diagram:",
  sequence: "Create a sequence diagram:",
  bpmn: "Create a BPMN diagram:",
  document: "Create a document:",
};

export function getDiagramExamples(format: DiagramExampleFormat): DiagramExample[] {
  return EXAMPLES[format] ?? EXAMPLES.architecture;
}
