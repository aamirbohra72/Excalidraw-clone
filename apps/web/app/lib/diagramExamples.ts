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
