"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildFallbackPickCards,
  defaultUserContext,
  mockAgentResponse,
  mockPromotionDraft,
  type AgentResponse,
  type PickCard,
  type UserContext
} from "@goaround/agent-core";

type Mode = "user" | "business";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; cards?: PickCard[] };
type LocationState = { status: "detecting" | "detected" | "fallback" | "denied" | "unsupported"; label: string; detail: string; contextName: string; lat?: number; lon?: number };
type WeatherState = { status: "loading" | "live" | "fallback"; condition: string; icon: string; area: string; detail: string; sourceName: string; sourceUrl: string };
type Landmark = { name: string; area: string; lat: number; lon: number };

const defaultPersona = "male 30s, foodie, likes to chill, value-conscious, prefers practical nearby options";
const suggestedInterests = ["Food & Dining", "Events", "Groceries", "Deals", "Kids activities", "Rainy day", "Coffee", "Lunch", "Shopping", "Fitness"];

const landmarks: Landmark[] = [
  { name: "Marina Bay Sands", area: "Marina Bay", lat: 1.2834, lon: 103.8607 },
  { name: "Chinatown", area: "Chinatown", lat: 1.284, lon: 103.843 },
  { name: "Tanjong Pagar", area: "Tanjong Pagar", lat: 1.2764, lon: 103.8458 },
  { name: "Orchard Road", area: "Orchard", lat: 1.3048, lon: 103.8318 },
  { name: "Bugis", area: "Bugis", lat: 1.3008, lon: 103.8551 },
  { name: "Little India", area: "Little India", lat: 1.3067, lon: 103.8493 },
  { name: "Sengkang", area: "Sengkang", lat: 1.3917, lon: 103.895 },
  { name: "Punggol", area: "Punggol", lat: 1.3984, lon: 103.9072 },
  { name: "Jurong East", area: "Jurong East", lat: 1.3331, lon: 103.7423 },
  { name: "Woodlands", area: "Woodlands", lat: 1.436, lon: 103.786 },
  { name: "Tampines", area: "Tampines", lat: 1.3521, lon: 103.9447 }
];

const welcomeMessage = "Hi, I’m Ask GoAround — your local decision engine. Tell me what you’re deciding, what matters most, or what constraints you have, and I’ll compare live signals, rank the trade-offs, and recommend the next best move around your area.";

const loadingSteps = [
  { label: "Classifying intent", tool: "orchestrator" },
  { label: "Planning tools", tool: "orchestrator" },
  { label: "Searching live sources", tool: "exa" },
  { label: "Re-ranking candidates", tool: "ranking" },
  { label: "Writing explanation", tool: "ai-gateway" },
  { label: "Returning decision", tool: "storage" }
];

function inferFoodIcon(card: PickCard): string {
  const text = `${card.title} ${card.description} ${card.tags.join(" ")}`.toLowerCase();
  if (/beer|bar|pub|pint|drink|cocktail/.test(text)) return "🍺";
  if (/chicken\s*rice|rice|nasi|biryani/.test(text)) return "🍚";
  if (/noodle|ramen|laksa|mee|pho/.test(text)) return "🍜";
  if (/coffee|kopi|cafe|tea/.test(text)) return "☕";
  if (/dessert|cake|ice cream|waffle|sweet/.test(text)) return "🍰";
  if (/pizza/.test(text)) return "🍕";
  if (/sushi|japanese/.test(text)) return "🍣";
  if (/burger/.test(text)) return "🍔";
  return "🍽️";
}

function CategoryIcon({ card, category }: { card?: PickCard; category?: PickCard["category"] }) {
  const resolvedCategory = card?.category ?? category ?? "other";
  if (card?.category === "food") return <span style={{ fontSize: 42 }}>{inferFoodIcon(card)}</span>;
  const iconMap: Record<string, string> = { weather: "🌤️", event: "🗓️", food: "🍽️", grocery: "🛒", deal: "🏷️", promotion: "🍚", transport: "🚇", other: "📍" };
  return <span style={{ fontSize: 42 }}>{iconMap[resolvedCategory] ?? "📍"}</span>;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferPlaceName(lat: number, lon: number) {
  const nearest = landmarks.map((landmark) => ({ ...landmark, distance: distanceKm(lat, lon, landmark.lat, landmark.lon) })).sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return { label: "Current location", detail: `${lat}, ${lon}`, contextName: `near coordinates ${lat}, ${lon} in Singapore` };
  if (nearest.distance <= 0.9) return { label: nearest.name, detail: `Current location · about ${nearest.distance.toFixed(1)} km from ${nearest.area}`, contextName: nearest.area };
  if (nearest.distance <= 3.5) return { label: `Near ${nearest.name}`, detail: `Current location · about ${nearest.distance.toFixed(1)} km away`, contextName: nearest.area };
  return { label: "Current location", detail: `${lat}, ${lon} · nearest known area: ${nearest.area}`, contextName: `near ${nearest.area}` };
}

function formatLocalTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function inferTimeUse(date: Date) {
  const hour = date.getHours();
  if (hour < 11) return "Morning context: better for breakfast, coffee, commute and early activities.";
  if (hour < 15) return "Lunch context: better for food, cafes and quick nearby errands.";
  if (hour < 19) return "Afternoon context: better for errands, shopping, kids activities and events.";
  return "Evening context: better for dinner, drinks, groceries, events and indoor options.";
}

function inferTimeLabel(date: Date): "morning" | "lunch" | "evening" | "weekend" {
  const day = date.getDay();
  const hour = date.getHours();
  if (day === 0 || day === 6) return "weekend";
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  return "evening";
}

function buildContextualPrompts(context: UserContext, localTime: Date, weather: WeatherState): string[] {
  const area = context.locationName.replace(/^near\s+/i, "") || "my area";
  const hour = localTime.getHours();
  const isRainy = /rain|shower|thunder/i.test(weather.condition);
  const base = [
    `What is the best thing to do around ${area} now for a ${defaultPersona}?`,
    `Compare food, drinks, and chill options near ${area} for right now`,
    `Find me something good value near ${area} with source-backed prices`,
    `Build a short plan around ${area} using live sources`
  ];

  if (isRainy) return [`What should I do near ${area} if it may rain?`, `Find indoor food and chill options near ${area}`, ...base.slice(1, 3)].slice(0, 4);
  if (hour >= 17) return [`Find me a chill dinner or bar near ${area} with good value`, `Where can I get a pint of beer under $15 near ${area}?`, ...base.slice(0, 2)].slice(0, 4);
  if (hour >= 11 && hour < 15) return [`Pick the best lunch near ${area} under $15`, `Compare quick lunch options near ${area}`, ...base.slice(0, 2)].slice(0, 4);
  return [`Find coffee or breakfast near ${area}`, `What is worth doing near ${area} this morning?`, ...base.slice(0, 2)].slice(0, 4);
}

function buildLocalResponse(context: UserContext): AgentResponse {
  const area = context.locationName.replace(/^near\s+/i, "") || "your area";
  return {
    ...mockAgentResponse,
    runId: `local-${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    answer: `I prepared today's source-backed starting picks for ${area}. Ask me what you are deciding and I will search live sources, rank options, and explain the trade-offs.`,
    cards: buildFallbackPickCards(context),
    fallbackUsed: true,
    trace: [{ step: "Prepare local context", status: "success", detail: `Loaded fallback starting picks for ${area}. Ask a decision question to trigger live Exa search.`, tool: "orchestrator" }]
  };
}

function buildFollowUpSuggestions(response: AgentResponse): string[] {
  const categories = new Set(response.cards.map((card) => card.category));
  if (categories.has("food")) return ["Compare by price and distance", "Find one place open now", "Give me a 2-hour food plan", "Find cheaper alternatives"];
  if (categories.has("event")) return ["Which is best for kids?", "Show indoor options only", "Make a short weekend plan", "Find free activities nearby"];
  if (categories.has("deal")) return ["Which deal is closest?", "Show grocery deals only", "Find food discounts nearby", "Compare these options"];
  return ["Narrow this to 1 km", "Show family-friendly options", "Give me a short plan", "Find something cheaper"];
}

function metadataList(card: PickCard, key: string): string[] {
  const value = card.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function cardSignalCount(card: PickCard): number {
  return metadataList(card, "priceSignals").length + metadataList(card, "addressSignals").length + metadataList(card, "openingSignals").length;
}

function visibleResultLimit(cards: PickCard[]): number {
  if (cards.length <= 3) return cards.length;
  const strongCards = cards.filter((card, index) => index < 3 || (card.score ?? 0) >= 0.75 || cardSignalCount(card) > 0).length;
  return Math.min(5, Math.max(3, strongCards));
}

function PracticalSignals({ card }: { card: PickCard }) {
  const signals = [
    ...metadataList(card, "priceSignals").map((item) => `💵 ${item}`),
    ...metadataList(card, "addressSignals").map((item) => `📍 ${item}`),
    ...metadataList(card, "openingSignals").map((item) => `🕒 ${item}`)
  ].slice(0, 3);
  if (!signals.length) return null;
  return <div className="trace muted">{signals.map((signal) => <div key={signal}>{signal}</div>)}</div>;
}

function Sidebar({ mode, location, localTime, weather }: { mode: Mode; location: LocationState; localTime: Date; weather: WeatherState }) {
  return (
    <aside className="sidebar">
      <div className="brand"><div className="logo-pin">G</div><div><div className="brand-title">GoAround <span>SG</span></div><div className="brand-subtitle">AI local decision engine for Singapore</div></div></div>
      <div className="nav-item active">🏠 {mode === "user" ? "GoAround Today" : "Business Demo"}</div>
      {mode === "user" && <div className="nav-item">🤖 Agent trace shown below</div>}
      {mode === "user" ? (
        <div className="context-card">
          <h3>📍 My decision context</h3>
          <div className="muted">Persona: {defaultPersona}. GoAround uses this context to rank nearby options.</div>
          <div className="context-stat"><span>Current location</span><strong>{location.label}</strong><small>{location.detail}</small></div>
          <div className="context-stat weather-stat"><div className="weather-icon">{weather.icon}</div><div><span>Weather</span><strong>{weather.status === "loading" ? "Checking weather…" : `${weather.condition} near ${weather.area}`}</strong><small>{weather.detail}</small></div></div>
          <div className="context-stat"><span>Local time</span><strong>{formatLocalTime(localTime)}</strong><small>{inferTimeUse(localTime)}</small></div>
        </div>
      ) : (
        <div className="context-card"><h3>🏪 Business profile</h3><p><strong>Ah Boyz Chicken Rice</strong></p><div className="muted">Hawker · Sengkang<br />Verified merchant</div><button className="button-primary">View public profile</button></div>
      )}
    </aside>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className="mode-toggle"><a className={mode === "user" ? "active" : ""} onClick={() => setMode("user")}>👤 User</a><a className={mode === "business" ? "active" : ""} onClick={() => setMode("business")}>🏪 Business</a></div>;
}

function cardMatchesInterest(card: PickCard, interests: string[]) {
  if (card.category === "weather" || interests.length === 0) return true;
  const haystack = [card.category, card.title, card.description, ...card.tags].join(" ").toLowerCase();
  return interests.some((interest) => {
    const text = interest.toLowerCase();
    if (text.includes("food") && card.category === "food") return true;
    if (text.includes("event") && card.category === "event") return true;
    if (text.includes("deal") && card.category === "deal") return true;
    if ((text.includes("grocery") || text.includes("groceries")) && card.category === "grocery") return true;
    return haystack.includes(text.replace("&", "").trim()) || haystack.includes(text.split(" ")[0]);
  });
}

function FormattedAssistantMessage({ content }: { content: string }) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  function renderInline(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={`${part}-${partIndex}`}>{part.slice(2, -2)}</strong> : <span key={`${part}-${partIndex}`}>{part}</span>);
  }

  return (
    <div className="assistant-copy">
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
        const bulletLines = lines.filter((line) => /^[-•]\s+/.test(line));
        const introLines = lines.filter((line) => !/^[-•]\s+/.test(line));

        if (bulletLines.length > 0) {
          return (
            <div className="assistant-section" key={`${paragraph.slice(0, 24)}-${index}`}>
              {introLines.map((line, lineIndex) => <p key={`${line}-${lineIndex}`}>{renderInline(line)}</p>)}
              <ul>
                {bulletLines.map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{renderInline(line.replace(/^[-•]\s+/, ""))}</li>)}
              </ul>
            </div>
          );
        }

        if (lines.length > 1) {
          return <div className="assistant-section" key={`${paragraph.slice(0, 24)}-${index}`}>{lines.map((line, lineIndex) => <p key={`${line}-${lineIndex}`}>{renderInline(line)}</p>)}</div>;
        }

        return <p key={`${paragraph.slice(0, 24)}-${index}`}>{renderInline(paragraph)}</p>;
      })}
    </div>
  );
}

function ResultCarousel({ cards }: { cards: PickCard[] }) {
  if (cards.length === 0) return null;
  const visibleCards = cards.slice(0, visibleResultLimit(cards));
  return (
    <div className="chat-card-carousel">
      {visibleCards.map((card, index) => (
        <article className="chat-result-card" key={card.id}>
          <div className="chat-result-top"><span className="tag">#{index + 1} · {card.category}</span><CategoryIcon card={card} /></div>
          <strong>{card.title}</strong>
          <p className="muted">{card.description}</p>
          <PracticalSignals card={card} />
          <div className="chat-result-footer"><span>{card.distanceKm ? `📍 ${card.distanceKm} km` : "Source-backed"}</span><a href={card.sourceUrl} target="_blank">Source ↗</a></div>
        </article>
      ))}
      {cards.length > visibleCards.length && <div className="muted">Showing top {visibleCards.length} of {cards.length} ranked sources.</div>}
    </div>
  );
}

function LoadingAgentSteps() {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActiveIndex((index) => Math.min(index + 1, loadingSteps.length - 1)), 850);
    return () => window.clearInterval(timer);
  }, []);
  const active = loadingSteps[activeIndex];
  return <div className="agent-progress"><div className="agent-progress-title"><span>🤖</span><strong>Agent runtime working</strong></div><div className="agent-progress-steps"><div className="agent-progress-step"><span>{activeIndex + 1}</span><div><strong>{active.label}</strong><small>{active.tool} · step {activeIndex + 1} of {loadingSteps.length}</small></div></div></div></div>;
}

function PicksPanel({ response, radiusKm, setRadiusKm, interests, setInterests }: { response: AgentResponse; radiusKm: number; setRadiusKm: (value: number) => void; interests: string[]; setInterests: (value: string[]) => void }) {
  const [interestInput, setInterestInput] = useState("");
  const allInterests = Array.from(new Set([...suggestedInterests, ...interests]));
  const suggestions = suggestedInterests.filter((item) => !interests.includes(item)).filter((item) => item.toLowerCase().includes(interestInput.toLowerCase())).slice(0, 4);
  const filteredCards = response.cards.filter((card) => card.distanceKm === undefined || card.distanceKm <= radiusKm).filter((card) => cardMatchesInterest(card, interests));
  function toggleInterest(interest: string) { setInterests(interests.includes(interest) ? interests.filter((item) => item !== interest) : [...interests, interest]); }
  function addInterest(interest: string) { const clean = interest.trim(); if (!clean) return; if (!interests.includes(clean)) setInterests([...interests, clean]); setInterestInput(""); }

  return (
    <section className="picks-card fixed-panel">
      <div className="fixed-panel-header"><h2>✨ Today&apos;s Picks</h2><div className="muted">Daily context picks stay stable. Chat results appear in the conversation.</div>
        <div className="pick-filter-card"><div className="field-label">Decision radius <span style={{ float: "right", color: "var(--blue)" }}>{radiusKm.toFixed(1)} km</span></div><input value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} type="range" min="0.5" max="3" step="0.1" style={{ width: "100%" }} /><div className="field-label">Interests</div><div className="pill-row compact">{allInterests.map((item) => <button className={`filter-pill ${interests.includes(item) ? "active" : ""}`} key={item} onClick={() => toggleInterest(item)}>{item}{interests.includes(item) ? " ×" : ""}</button>)}</div><div className="interest-input-row"><input value={interestInput} onChange={(event) => setInterestInput(event.target.value)} placeholder="Add interest, e.g. craft beer" /><button onClick={() => addInterest(interestInput)}>Add</button></div>{interestInput && suggestions.length > 0 && <div className="suggestion-row">{suggestions.map((item) => <button key={item} onClick={() => addInterest(item)}>{item}</button>)}</div>}</div>
      </div>
      <div className="pick-list scroll-list">{filteredCards.map((card, index) => <article className="pick-card" key={card.id}><div className="pick-top"><div><span className="tag">{index + 1} · {card.category}</span></div><CategoryIcon card={card} /></div><h3>{card.title}</h3><p className="muted">{card.description}</p><PracticalSignals card={card} /><div className="pick-footer"><span>📍 {card.distanceKm ? `Within ${card.distanceKm} km` : "Source-backed"}</span><a className="source-link" href={card.sourceUrl} target="_blank">Open source ↗</a></div>{card.whyShown && <div className="trace muted">{card.whyShown}</div>}</article>)}{filteredCards.length === 0 && <div className="muted">No picks match the current filters. Try widening the radius or enabling more interests.</div>}</div>
    </section>
  );
}

function UserMode({ userContext, radiusKm, setRadiusKm, interests, setInterests, localTime, weather }: { userContext: UserContext; radiusKm: number; setRadiusKm: (value: number) => void; interests: string[]; setInterests: (value: string[]) => void; localTime: Date; weather: WeatherState }) {
  const todayResponse = useMemo(() => buildLocalResponse(userContext), [userContext]);
  const contextualPrompts = useMemo(() => buildContextualPrompts(userContext, localTime, weather), [localTime, userContext, weather]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<AgentResponse>(todayResponse);
  const [lastResultCards, setLastResultCards] = useState<PickCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", role: "assistant", content: welcomeMessage }]);
  const prompts = messages.length === 1 ? contextualPrompts : response.followUps?.length ? response.followUps : buildFollowUpSuggestions(response);

  useEffect(() => { if (messages.length === 1) setResponse(todayResponse); }, [messages.length, todayResponse]);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function askAgent(message: string) {
    if (!message.trim()) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: message };
    const conversationHistory = [...messages, userMessage].filter((item) => item.id !== "welcome").slice(-8).map((item) => ({ role: item.role, content: item.content }));
    const previousCards = lastResultCards.length ? lastResultCards : response.fallbackUsed ? [] : response.cards;
    setMessages((current) => [...current, userMessage]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "demo-session", message, context: userContext, conversationHistory, previousCards }) });
      const data = (await res.json()) as AgentResponse;
      setResponse(data);
      if (data.cards.length) setLastResultCards(data.cards);
      setMessages((current) => [...current, { id: data.runId, role: "assistant", content: data.answer, cards: data.cards }]);
    } catch {
      const fallbackResponse = buildLocalResponse(userContext);
      setResponse(fallbackResponse);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "I hit a temporary error while calling the agent, so I kept safe fallback picks visible. Please try again.", cards: fallbackResponse.cards }]);
    } finally { setLoading(false); }
  }
  async function onSubmit(event: FormEvent) { event.preventDefault(); const message = input; setInput(""); await askAgent(message); }

  return <div className="user-grid fixed-user-grid"><main className="main-card chat-hero fixed-panel"><div className="fixed-panel-header" style={{ display: "flex", justifyContent: "space-between" }}><h2>💬 Ask GoAround</h2><span className="muted">🛡️ {response.fallbackUsed ? "Safe fallback" : "Live Exa search"}</span></div><div ref={chatScrollRef} className="chat-scroll flexible-scroll">{messages.map((message) => <div className={`chat-message-row ${message.role}`} key={message.id}><div className={`chat-bubble ${message.role}`}><span>{message.role === "assistant" ? "🤖" : "👤"}</span>{message.role === "assistant" ? <FormattedAssistantMessage content={message.content} /> : <span>{message.content}</span>}</div>{message.role === "assistant" && message.cards && <ResultCarousel cards={message.cards} />}</div>)}{loading && <LoadingAgentSteps />}{messages.length === 1 && <div className="empty-chat-hint"><div className="robot">🤖</div><h2>What should you do next?</h2><div className="muted">Prompts are generated from your area, time, weather, and demo persona.</div></div>}</div><div className="prompt-strip"><span>{messages.length === 1 ? "Contextual decision prompts" : response.followUps?.length ? "AI Gateway follow-ups" : "Deterministic follow-ups"}</span><div className="quick-prompts">{prompts.map((prompt) => <button key={prompt} onClick={() => askAgent(prompt)}>{prompt}</button>)}</div></div><form className="chat-form" onSubmit={onSubmit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask GoAround what to decide around this area..." /><button className="send-button" disabled={loading}>{loading ? "…" : "➤"}</button></form><div className="trace muted compact-trace"><strong>Agent trace</strong>{response.trace.map((step, index) => <div key={`${step.step}-${index}`}>• {step.step}: {step.detail}</div>)}</div></main><PicksPanel response={todayResponse} radiusKm={radiusKm} setRadiusKm={setRadiusKm} interests={interests} setInterests={setInterests} /></div>;
}

function BusinessMode() {
  return <div className="business-grid"><section className="business-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2>Create Promotion</h2><div className="muted">Fill in the details. The agent reviews it before payment and publishing.</div></div><button className="source-link">Save draft</button></div><div className="form-grid" style={{ marginTop: 22 }}><label><div className="field-label">Business name</div><input className="input" defaultValue={mockPromotionDraft.businessName} /></label><label><div className="field-label">Promotion title</div><input className="input" defaultValue={mockPromotionDraft.title} /></label><label><div className="field-label">Category</div><select className="field" defaultValue="promotion"><option>promotion</option><option>food</option><option>deal</option></select></label><label><div className="field-label">Location / Area</div><input className="input" defaultValue={mockPromotionDraft.locationName} /></label><label className="full"><div className="field-label">Short description</div><textarea className="textarea" defaultValue={mockPromotionDraft.description} /></label><label className="full"><div className="field-label">CTA / source link</div><input className="input" defaultValue={mockPromotionDraft.sourceUrl} /></label></div><button className="button-primary">Review & Pay to Publish</button><div className="trace muted">Human-in-the-loop: merchant approval is required before Stripe checkout and publishing.</div></section><section className="business-card"><h2>Preview</h2><div className="muted">This is how your promotion will appear in GoAround Today.</div><div className="preview-phone" style={{ marginTop: 20 }}><div className="preview-card"><span className="tag">Food & Dining</span><div style={{ height: 150, borderRadius: 18, margin: "14px 0", display: "grid", placeItems: "center", background: "#fff3e8", fontSize: 64 }}>🍚</div><h3>{mockPromotionDraft.title}</h3><p className="muted">{mockPromotionDraft.description}</p><a className="source-link" href={mockPromotionDraft.sourceUrl} target="_blank">View details ↗</a></div></div></section></div>;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("user");
  const [localTime, setLocalTime] = useState(new Date());
  const [radiusKm, setRadiusKm] = useState(defaultUserContext.radiusKm);
  const [interests, setInterests] = useState(defaultUserContext.interests);
  const [weather, setWeather] = useState<WeatherState>({ status: "loading", condition: "Checking weather…", icon: "🌦️", area: defaultUserContext.locationName, detail: "Fetching live Singapore weather forecast.", sourceName: "data.gov.sg 2-hour weather forecast", sourceUrl: "https://data.gov.sg/" });
  const [location, setLocation] = useState<LocationState>({ status: "detecting", label: "Detecting location…", detail: "Allow browser location access for better local picks.", contextName: defaultUserContext.locationName, lat: defaultUserContext.lat, lon: defaultUserContext.lon });

  useEffect(() => { const timer = window.setInterval(() => setLocalTime(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!("geolocation" in navigator)) { setLocation({ status: "unsupported", label: defaultUserContext.locationName, detail: "Browser geolocation is not available. Using default demo area.", contextName: defaultUserContext.locationName, lat: defaultUserContext.lat, lon: defaultUserContext.lon }); return; }
    navigator.geolocation.getCurrentPosition((position) => { const lat = Number(position.coords.latitude.toFixed(5)); const lon = Number(position.coords.longitude.toFixed(5)); const inferred = inferPlaceName(lat, lon); setLocation({ status: "detected", label: inferred.label, detail: inferred.detail, contextName: inferred.contextName, lat, lon }); }, () => setLocation({ status: "denied", label: defaultUserContext.locationName, detail: "Location permission was not granted. Using default demo area.", contextName: defaultUserContext.locationName, lat: defaultUserContext.lat, lon: defaultUserContext.lon }), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const params = new URLSearchParams(); if (location.lat !== undefined) params.set("lat", String(location.lat)); if (location.lon !== undefined) params.set("lon", String(location.lon));
        const response = await fetch(`/api/weather?${params.toString()}`);
        const data = (await response.json()) as { condition: string; icon: string; area: string; detail: string; sourceName: string; sourceUrl: string; fallbackUsed: boolean };
        if (!cancelled) setWeather({ status: data.fallbackUsed ? "fallback" : "live", condition: data.condition, icon: data.icon, area: data.area, detail: data.detail, sourceName: data.sourceName, sourceUrl: data.sourceUrl });
      } catch {
        if (!cancelled) setWeather({ status: "fallback", condition: "Partly cloudy", icon: "⛅", area: location.contextName, detail: "Weather temporarily unavailable. Using safe fallback context.", sourceName: "Fallback weather context", sourceUrl: "https://www.weather.gov.sg/" });
      }
    }
    fetchWeather(); return () => { cancelled = true; };
  }, [location.contextName, location.lat, location.lon]);

  const userContext = useMemo<UserContext>(() => ({ ...defaultUserContext, locationName: location.contextName, lat: location.lat, lon: location.lon, radiusKm, interests, weather: weather.condition, timeOfDay: inferTimeLabel(localTime) }), [interests, localTime, location.contextName, location.lat, location.lon, radiusKm, weather.condition]);

  return <div className="app-shell"><Sidebar mode={mode} location={location} localTime={localTime} weather={weather} /><section className="content"><div className="topbar"><ModeToggle mode={mode} setMode={setMode} /><div className="muted">❔ SK</div></div><div style={{ display: mode === "user" ? "block" : "none" }}><UserMode userContext={userContext} radiusKm={radiusKm} setRadiusKm={setRadiusKm} interests={interests} setInterests={setInterests} localTime={localTime} weather={weather} /></div><div style={{ display: mode === "business" ? "block" : "none" }}><BusinessMode /></div></section></div>;
}
