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
      id: "erd-saas-billing",
      prompt:
        "SaaS billing ERD with orgs, members, plans, subscriptions, invoices, and payment_methods.",
    },
    {
      id: "erd-hospital",
      prompt:
        "Hospital ERD with patients, doctors, appointments, prescriptions, and lab_results.",
    },
    {
      id: "erd-lms",
      prompt:
        "Online learning ERD with students, courses, lessons, enrollments, and quiz_attempts.",
    },
    {
      id: "erd-hr",
      prompt:
        "HRIS ERD with employees, departments, roles, leave_requests, and performance_reviews.",
    },
    {
      id: "erd-support",
      prompt:
        "Support desk ERD with customers, tickets, agents, comments, and sla_policies.",
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
      id: "arch-drawapp",
      prompt:
        "DrawApp stack: Next.js web, Clerk auth, Neon Postgres, WebSocket collab server, Mistral diagram API.",
    },
    {
      id: "arch-3tier",
      prompt:
        "Classic 3-tier web app: Browser → Nginx → App servers → Postgres primary/replica with Redis cache.",
    },
    {
      id: "arch-serverless",
      prompt:
        "Serverless API: API Gateway → Lambda functions → DynamoDB, S3, and SQS for async jobs.",
    },
    {
      id: "arch-mobile-bff",
      prompt:
        "Mobile BFF architecture: iOS/Android → GraphQL BFF → auth, catalog, and recommendation services.",
    },
    {
      id: "arch-observability",
      prompt:
        "Observability stack: apps → OpenTelemetry collector → Prometheus, Loki, Tempo, and Grafana.",
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
      id: "flow-refund",
      prompt:
        "Refund request flow: validate order → check policy → approve/deny → credit payment → notify user.",
    },
    {
      id: "flow-password-reset",
      prompt:
        "Password reset flowchart: request link → validate token → set new password → revoke sessions.",
    },
    {
      id: "flow-hiring",
      prompt:
        "Hiring pipeline flow: apply → screen resume → interview loop → offer → accept or reject.",
    },
    {
      id: "flow-bug-triage",
      prompt:
        "Bug triage flow: report → reproduce → severity gate → assign → fix → verify → close.",
    },
    {
      id: "flow-kyc",
      prompt:
        "KYC verification flow: upload ID → OCR extract → risk score → manual review or auto-approve.",
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
      id: "seq-razorpay",
      prompt:
        "Razorpay checkout sequence: WebApp creates order, Browser pays, webhook verifies, Team plan unlocks.",
    },
    {
      id: "seq-websocket",
      prompt:
        "Realtime board sync sequence: Client A draws, WS server broadcasts, Client B applies patch.",
    },
    {
      id: "seq-file-upload",
      prompt:
        "Signed S3 upload sequence: Client requests URL, API returns signed URL, Client PUTs file, CDN invalidate.",
    },
    {
      id: "seq-2fa",
      prompt:
        "Login with 2FA sequence: Browser, Auth API, SMS gateway, and session store with OTP verify.",
    },
    {
      id: "seq-saga",
      prompt:
        "Order saga sequence: Order, Payment, Inventory, Shipping with compensate on payment failure.",
    },
    {
      id: "seq-invite",
      prompt:
        "Team invite sequence: Admin invites, Email link, Invitee accepts, Auth creates membership.",
    },
    {
      id: "seq-webhook-retry",
      prompt:
        "Webhook delivery sequence: Producer → Queue → Worker → Partner API with retry and DLQ.",
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
      id: "bpmn-employee-onboard",
      prompt:
        "Employee onboarding BPMN across HR, IT, and Manager with laptop setup and access grants.",
    },
    {
      id: "bpmn-purchase",
      prompt:
        "Purchase request BPMN across Requester, Manager, Finance, and Vendor with budget gate.",
    },
    {
      id: "bpmn-support-ticket",
      prompt:
        "Support ticket BPMN across Customer, L1 Support, L2 Engineering, and QA with reopen path.",
    },
    {
      id: "bpmn-refund",
      prompt:
        "Refund handling BPMN across Customer Care, Payments, and Finance with fraud check gateway.",
    },
    {
      id: "bpmn-change-mgmt",
      prompt:
        "IT change management BPMN across Requester, CAB, Ops, and SRE with rollback decision.",
    },
    {
      id: "bpmn-hiring",
      prompt:
        "Hiring BPMN across Recruiter, Hiring Manager, and Candidate with offer accept/reject.",
    },
    {
      id: "bpmn-insurance-claim",
      prompt:
        "Insurance claim BPMN across Policyholder, Claims Agent, Adjuster, and Payout with deny path.",
    },
    {
      id: "bpmn-content-publish",
      prompt:
        "Content publish BPMN across Writer, Editor, Legal, and Ops with schedule vs reject.",
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
      id: "doc-drawapp",
      prompt:
        "Document DrawApp: Next.js board, Clerk auth, Razorpay Team plan, Mermaid AI diagrams, Neon DB.",
    },
    {
      id: "doc-api-design",
      prompt:
        "Write an API design doc for a public REST + webhook product with versioning and rate limits.",
    },
    {
      id: "doc-data-model",
      prompt:
        "Document the entity model for a multi-tenant SaaS: orgs, members, boards, and billing.",
    },
    {
      id: "doc-ci-cd",
      prompt:
        "Write a CI/CD runbook: branch strategy, checks, staging promote, and rollback steps.",
    },
    {
      id: "doc-incident",
      prompt:
        "Write an incident response playbook with severity levels, on-call roles, and comms templates.",
    },
    {
      id: "doc-security",
      prompt:
        "Document a security overview: authn/z, secrets, encryption, audit logs, and threat model.",
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

/** Short tips shown above example chips for each format. */
export const DIAGRAM_FORMAT_HINTS: Record<DiagramExampleFormat, string> = {
  architecture:
    "Click a sample to generate a system architecture (services, gateways, data stores).",
  flowchart: "Click a sample to generate a process flow with decisions and Yes/No paths.",
  erd: "Click a sample to generate an entity-relationship / Prisma-style data model.",
  sequence: "Click a sample to generate a participant message sequence (request/response).",
  bpmn: "Click a sample to generate a BPMN-style process with swimlanes and gateways.",
  document: "Click a sample to generate Markdown architecture / design documentation.",
};

export function getDiagramExamples(format: DiagramExampleFormat): DiagramExample[] {
  return EXAMPLES[format] ?? EXAMPLES.architecture;
}
