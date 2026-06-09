export type UserMode = "resident" | "visitor" | "worker" | "business";

export type PickCategory =
  | "weather"
  | "event"
  | "food"
  | "grocery"
  | "deal"
  | "promotion"
  | "transport"
  | "other";

export type ToolName =
  | "orchestrator"
  | "exa"
  | "ranking"
  | "ai-gateway"
  | "stripe"
  | "storage"
  | "fallback";

export type AgentIntent =
  | "food_discovery"
  | "event_discovery"
  | "deal_discovery"
  | "rainy_day_plan"
  | "visitor_plan"
  | "merchant_promotion"
  | "general_discovery";

export type UserContext = {
  mode: UserMode;
  locationName: string;
  lat?: number;
  lon?: number;
  radiusKm: number;
  interests: string[];
  weather?: string;
  timeOfDay?: "morning" | "lunch" | "evening" | "weekend";
};

export type PickCard = {
  id: string;
  title: string;
  description: string;
  category: PickCategory;
  sourceName: string;
  sourceUrl: string;
  distanceKm?: number;
  score?: number;
  whyShown?: string;
  sourceVerified: boolean;
  tags: string[];
  imageUrl?: string;
  metadata?: Record<string, unknown>;
};

export type AgentTraceStep = {
  step: string;
  status: "success" | "failed" | "skipped";
  detail: string;
  tool: ToolName;
  startedAt?: string;
  completedAt?: string;
};

export type AgentRequest = {
  sessionId: string;
  message: string;
  context: UserContext;
};

export type AgentResponse = {
  runId: string;
  intent: AgentIntent;
  answer: string;
  cards: PickCard[];
  trace: AgentTraceStep[];
  fallbackUsed: boolean;
};

export type SearchToolInput = {
  query: string;
  context: UserContext;
  intent: AgentIntent;
};

export type SearchToolResult = {
  cards: PickCard[];
  raw?: unknown;
  fallbackUsed: boolean;
};

export type PromotionDraft = {
  id: string;
  businessName: string;
  title: string;
  description: string;
  category: PickCategory;
  locationName: string;
  sourceUrl: string;
  validFrom?: string;
  validTo?: string;
  status: "draft" | "review_required" | "payment_required" | "paid" | "published" | "rejected";
  stripeCheckoutUrl?: string;
};
