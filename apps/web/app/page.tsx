"use client";

import { FormEvent, useState } from "react";
import { defaultUserContext, mockAgentResponse, mockPromotionDraft, type AgentResponse, type PickCard } from "@goaround/agent-core";

type Mode = "user" | "business";

const quickPrompts = [
  "Where can I eat cheap near me?",
  "What's happening this weekend?",
  "Indoor activities for rainy days",
  "Show me grocery deals nearby"
];

function CategoryIcon({ category }: { category: PickCard["category"] }) {
  const iconMap: Record<string, string> = {
    weather: "🌤️",
    event: "🗓️",
    food: "🍔",
    grocery: "🛒",
    deal: "🏷️",
    promotion: "🍚",
    transport: "🚇",
    other: "📍"
  };
  return <span style={{ fontSize: 42 }}>{iconMap[category] ?? "📍"}</span>;
}

function Sidebar({ mode }: { mode: Mode }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo-pin">G</div>
        <div>
          <div className="brand-title">GoAround <span>SG</span></div>
          <div className="brand-subtitle">AI local discovery assistant for Singapore</div>
        </div>
      </div>

      <div className="nav-item active">🏠 {mode === "user" ? "GoAround Today" : "Dashboard"}</div>
      <div className="nav-item">🧭 {mode === "user" ? "Explore" : "Create Promotion"}</div>
      <div className="nav-item">🔖 {mode === "user" ? "Saved" : "Campaigns"}</div>
      <div className="nav-item">ℹ️ How Agent Works</div>

      {mode === "user" ? (
        <div className="context-card">
          <h3>📍 My area</h3>
          <div className="muted">Tell us where you are to get better picks.</div>
          <div className="field-label">I am here as</div>
          <div className="field">Resident</div>
          <div className="field-label">Try location</div>
          <div className="field">Sengkang</div>
          <div className="field-label">Discovery radius <span style={{ float: "right", color: "var(--blue)" }}>1.5 km</span></div>
          <input type="range" min="0.5" max="3" step="0.1" defaultValue="1.5" style={{ width: "100%" }} />
          <div className="field-label">Interests</div>
          <div className="pill-row">
            {defaultUserContext.interests.map((item) => <span className="pill" key={item}>{item} ×</span>)}
          </div>
          <button className="button-primary">💾 Save my area</button>
        </div>
      ) : (
        <div className="context-card">
          <h3>🏪 Business profile</h3>
          <p><strong>Ah Boyz Chicken Rice</strong></p>
          <div className="muted">Hawker · Sengkang<br />Verified merchant</div>
          <button className="button-primary">View public profile</button>
        </div>
      )}
    </aside>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return (
    <div className="mode-toggle">
      <a className={mode === "user" ? "active" : ""} onClick={() => setMode("user")}>👤 User</a>
      <a className={mode === "business" ? "active" : ""} onClick={() => setMode("business")}>🏪 Business</a>
    </div>
  );
}

function PicksPanel({ response }: { response: AgentResponse }) {
  return (
    <section className="picks-card">
      <h2>✨ Today&apos;s Picks</h2>
      <div className="muted">Ranked by GoAround Agent using source-backed data.</div>
      <div className="pick-list">
        {response.cards.slice(0, 4).map((card, index) => (
          <article className="pick-card" key={card.id}>
            <div className="pick-top">
              <div><span className="tag">{index + 1} · {card.category}</span></div>
              <CategoryIcon category={card.category} />
            </div>
            <h3>{card.title}</h3>
            <p className="muted">{card.description}</p>
            <div className="pick-footer">
              <span>📍 {card.distanceKm ? `Within ${card.distanceKm} km` : "Source-backed"}</span>
              <a className="source-link" href={card.sourceUrl} target="_blank">Open source ↗</a>
            </div>
            {card.whyShown && <div className="trace muted">{card.whyShown}</div>}
          </article>
        ))}
      </div>
    </section>
  );
}

function UserMode() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<AgentResponse>(mockAgentResponse);
  const [loading, setLoading] = useState(false);

  async function askAgent(message: string) {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "demo-session", message, context: defaultUserContext })
      });
      const data = (await res.json()) as AgentResponse;
      setResponse(data);
    } catch {
      setResponse(mockAgentResponse);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await askAgent(input);
    setInput("");
  }

  return (
    <div className="user-grid">
      <main className="main-card chat-hero">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2>💬 Ask GoAround</h2>
          <span className="muted">🛡️ {response.fallbackUsed ? "Safe fallback" : "Live Exa search"}</span>
        </div>
        <div className="chat-bubble">🤖 <span>{response.answer}</span></div>
        <div className="robot">🤖</div>
        <h2 style={{ textAlign: "center" }}>How can I help you today?</h2>
        <div className="muted" style={{ textAlign: "center" }}>Try one of the ideas below or ask anything.</div>
        <div className="quick-prompts">
          {quickPrompts.map((prompt) => <button key={prompt} onClick={() => askAgent(prompt)}>{prompt}</button>)}
        </div>
        <form className="chat-form" onSubmit={onSubmit}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask GoAround about this area..." />
          <button className="send-button" disabled={loading}>{loading ? "…" : "➤"}</button>
        </form>
        <div className="trace muted">
          <strong>Agent trace</strong>
          {response.trace.map((step, index) => <div key={`${step.step}-${index}`}>• {step.step}: {step.detail}</div>)}
        </div>
      </main>
      <PicksPanel response={response} />
    </div>
  );
}

function BusinessMode() {
  return (
    <div className="business-grid">
      <section className="business-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Create Promotion</h2>
            <div className="muted">Fill in the details. The agent reviews it before payment and publishing.</div>
          </div>
          <button className="source-link">Save draft</button>
        </div>
        <div className="form-grid" style={{ marginTop: 22 }}>
          <label><div className="field-label">Business name</div><input className="input" defaultValue={mockPromotionDraft.businessName} /></label>
          <label><div className="field-label">Promotion title</div><input className="input" defaultValue={mockPromotionDraft.title} /></label>
          <label><div className="field-label">Category</div><select className="field" defaultValue="promotion"><option>promotion</option><option>food</option><option>deal</option></select></label>
          <label><div className="field-label">Location / Area</div><input className="input" defaultValue={mockPromotionDraft.locationName} /></label>
          <label className="full"><div className="field-label">Short description</div><textarea className="textarea" defaultValue={mockPromotionDraft.description} /></label>
          <label className="full"><div className="field-label">CTA / source link</div><input className="input" defaultValue={mockPromotionDraft.sourceUrl} /></label>
        </div>
        <button className="button-primary">Review & Pay to Publish</button>
        <div className="trace muted">Human-in-the-loop: merchant approval is required before Stripe checkout and publishing.</div>
      </section>
      <section className="business-card">
        <h2>Preview</h2>
        <div className="muted">This is how your promotion will appear in GoAround Today.</div>
        <div className="preview-phone" style={{ marginTop: 20 }}>
          <div className="preview-card">
            <span className="tag">Food & Dining</span>
            <div style={{ height: 150, borderRadius: 18, margin: "14px 0", display: "grid", placeItems: "center", background: "#fff3e8", fontSize: 64 }}>🍚</div>
            <h3>{mockPromotionDraft.title}</h3>
            <p className="muted">{mockPromotionDraft.description}</p>
            <a className="source-link" href={mockPromotionDraft.sourceUrl} target="_blank">View details ↗</a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("user");
  return (
    <div className="app-shell">
      <Sidebar mode={mode} />
      <section className="content">
        <div className="topbar">
          <ModeToggle mode={mode} setMode={setMode} />
          <div className="muted">❔ SK</div>
        </div>
        {mode === "user" ? <UserMode /> : <BusinessMode />}
      </section>
    </div>
  );
}
