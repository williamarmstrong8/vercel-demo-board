"use client"

import { useEffect, useRef, useState } from "react"
import type { ApiContext } from "@/lib/whiteboard/workflow"

export type WebsiteTemplate = "marketing" | "dashboard" | "login" | "products" | "api"

// Every template is authored against this fixed "design viewport" and then
// uniformly scaled to fit whatever size the node happens to be, so content
// never clips regardless of how the block is resized.
const DESIGN_W = 400
const DESIGN_H = 250

function FitToBox({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => {
      const { width, height } = node.getBoundingClientRect()
      if (width && height) setScale(Math.min(width / DESIGN_W, height / DESIGN_H))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ width: DESIGN_W, height: DESIGN_H, flexShrink: 0, transform: `scale(${scale})` }}>{children}</div>
    </div>
  )
}

export const WEBSITE_TEMPLATES: { id: WebsiteTemplate; label: string; description: string }[] = [
  { id: "marketing", label: "Marketing", description: "Hero + CTA landing page" },
  { id: "dashboard", label: "Dashboard", description: "Stats + chart from data" },
  { id: "login", label: "Login", description: "Auth form → signed-in state" },
  { id: "products", label: "Products", description: "Product grid from data" },
  { id: "api", label: "API response", description: "Raw JSON viewer" },
]

const PALETTE = ["#0070f3", "#f5a623", "#10b981", "#ff5f57", "#00b8d9", "#eab308"]

/* ---------------------------------- data ---------------------------------- */

function parseData(json?: string): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    // Route handlers usually pass JS object literals (unquoted keys, single
    // quotes, trailing commas). Normalize to JSON before giving up.
    try {
      const normalized = json
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, "$1")
      return JSON.parse(normalized)
    } catch {
      return null
    }
  }
}

function findArray(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
  }
  return null
}

function pick(item: unknown, keys: string[], fallback: string): string {
  if (item && typeof item === "object") {
    for (const k of keys) {
      const v = (item as Record<string, unknown>)[k]
      if (v != null) return String(v)
    }
  } else if (item != null) {
    return String(item)
  }
  return fallback
}

/* --------------------------------- shared --------------------------------- */

function Skeleton({ w, h = 8, r = 4 }: { w: number | string; h?: number; r?: number }) {
  return <span style={{ display: "block", width: w, height: h, borderRadius: r, background: "#ececec" }} />
}

function Badge({ populated }: { populated: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        color: populated ? "#10b981" : "#b0b0b0",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: populated ? "#10b981" : "#d0d0d0" }} />
      {populated ? "live data" : "no data"}
    </span>
  )
}

/* ------------------------------- entrypoint ------------------------------- */

export function WebsitePage({
  template,
  api,
  domain,
  loading,
  hasRun,
}: {
  template: WebsiteTemplate
  api: ApiContext | null
  domain: string
  loading: boolean
  // Data only appears once the workflow has run, so you can watch the shell
  // fill in when the upstream code → server call actually fetches.
  hasRun: boolean
}) {
  const populated = !!api && hasRun
  const data = parseData(api?.json)
  const rows = findArray(data)
  const body = (() => {
    switch (template) {
      case "dashboard":
        return <DashboardPage populated={populated} rows={rows} domain={domain} />
      case "login":
        return <LoginPage populated={populated} data={data} domain={domain} />
      case "products":
        return <ProductsPage populated={populated} rows={rows} domain={domain} />
      default:
        return <MarketingPage populated={populated} data={data} domain={domain} />
    }
  })()

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        opacity: loading ? 0.35 : 1,
        transition: "opacity 0.25s ease",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <FitToBox>{body}</FitToBox>
      </div>
      {/* chain / state footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px",
          borderTop: "1px solid #f0f0f0",
          background: "#fafafa",
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "#999",
          minWidth: 0,
        }}
      >
        <Badge populated={populated} />
        {api && api.chain.length > 0 && (
          <span style={{ marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#aaa" }}>
            {api.chain.join(" → ")}
          </span>
        )}
      </div>
    </div>
  )
}

/* -------------------------------- marketing ------------------------------- */

function MarketingPage({ populated, data, domain }: { populated: boolean; data: unknown; domain: string }) {
  // Content is driven by the upstream CMS/content route when available.
  const headline = pick(data, ["headline", "hero", "title"], `Build faster with ${domain}`)
  const subheadline = pick(
    data,
    ["subheadline", "subtitle", "description", "tagline"],
    "The all-in-one platform to ship your product. Fast, reliable, and built for scale.",
  )
  const cta = pick(data, ["cta", "ctaLabel", "button", "action"], "Get started")
  const featureData = (() => {
    const arr = data && typeof data === "object" ? (data as Record<string, unknown>).features : null
    return Array.isArray(arr) ? (arr as unknown[]).slice(0, 3) : null
  })()
  const featureLabels = [0, 1, 2].map((i) =>
    featureData ? pick(featureData[i], ["title", "name", "label"], "") : ["Fast", "Secure", "Scalable"][i],
  )

  return (
    <div style={{ height: "100%", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14, color: "#000" }}>{domain}</span>
        <div style={{ display: "flex", gap: 10 }}>
          {["Home", "Docs", "Pricing"].map((n) => (
            <span key={n} style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#666" }}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {populated ? (
        <>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 22, color: "#000", lineHeight: 1.15 }}>
            {headline}
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#666", lineHeight: 1.5 }}>
            {subheadline}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <Skeleton w="80%" h={18} r={6} />
          <Skeleton w="55%" h={18} r={6} />
          <Skeleton w="90%" h={8} />
          <Skeleton w="70%" h={8} />
        </div>
      )}

      <span
        style={{
          marginTop: 2,
          alignSelf: "flex-start",
          padding: "6px 14px",
          borderRadius: 8,
          background: populated ? "#000" : "#e5e5e5",
          color: populated ? "#fff" : "transparent",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {populated ? cta : "Get started"}
      </span>

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 8,
              border: "1px solid #eee",
              background: populated ? "#fff" : "#f6f6f6",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 8,
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 5, background: populated ? PALETTE[i] : "#e5e5e5", flexShrink: 0 }} />
            {populated ? (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#333" }}>{featureLabels[i]}</span>
            ) : (
              <Skeleton w="70%" h={6} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------- dashboard ------------------------------- */

function DashboardPage({ populated, rows, domain }: { populated: boolean; rows: Record<string, unknown>[] | null; domain: string }) {
  const count = rows?.length ?? 0
  const stats = populated
    ? [
        { label: "Records", value: String(count || 12) },
        { label: "Revenue", value: `$${(count * 1240 || 8420).toLocaleString()}` },
        { label: "Active", value: `${count * 3 || 48}` },
      ]
    : [
        { label: "Records", value: "" },
        { label: "Revenue", value: "" },
        { label: "Active", value: "" },
      ]
  const bars = [40, 68, 52, 84, 60, 92, 74]
  return (
    <div style={{ height: "100%", display: "flex" }}>
      {/* sidebar */}
      <div style={{ width: 46, borderRight: "1px solid #f0f0f0", padding: 10, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: populated ? "#0070f3" : "#e5e5e5" }} />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ width: 22, height: 6, borderRadius: 3, background: "#ececec" }} />
        ))}
      </div>
      {/* main */}
      <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13, color: "#000" }}>{domain} · Overview</span>
        <div style={{ display: "flex", gap: 8 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, border: "1px solid #eee", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: "#999" }}>{s.label}</span>
              {populated ? (
                <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 16, color: "#000" }}>{s.value}</span>
              ) : (
                <Skeleton w="60%" h={14} r={4} />
              )}
            </div>
          ))}
        </div>
        {/* chart */}
        <div style={{ flex: 1, minHeight: 0, border: "1px solid #eee", borderRadius: 8, padding: 10, display: "flex", alignItems: "flex-end", gap: 6 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: 3,
                background: populated ? "#0070f3" : "#ececec",
                opacity: populated ? 0.35 + (i / bars.length) * 0.65 : 1,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------- login --------------------------------- */

function LoginPage({ populated, data, domain }: { populated: boolean; data: unknown; domain: string }) {
  const token = pick(data, ["token", "sessionToken", "accessToken"], "sk_live_8f2c…a91")
  const name = pick(data, ["name", "user", "username", "email"], "Ada Lovelace")
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#fafafa" }}>
      <div style={{ width: 220, background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {populated ? (
          <>
            <span style={{ width: 34, height: 34, borderRadius: 9999, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700 }}>
              ✓
            </span>
            <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, color: "#000", textAlign: "center" }}>Welcome back</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#666", textAlign: "center" }}>{name}</span>
            <div style={{ borderRadius: 8, background: "#f6f6f6", border: "1px solid #eee", padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 9, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              session: {token}
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, color: "#000", textAlign: "center" }}>Sign in to {domain}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#999" }}>Email</span>
              <div style={{ height: 30, borderRadius: 8, border: "1px solid #e5e5e5", background: "#fbfbfb" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#999" }}>Password</span>
              <div style={{ height: 30, borderRadius: 8, border: "1px solid #e5e5e5", background: "#fbfbfb" }} />
            </div>
            <div style={{ height: 32, borderRadius: 8, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500 }}>
              Sign in
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------- products -------------------------------- */

function ProductsPage({ populated, rows, domain }: { populated: boolean; rows: Record<string, unknown>[] | null; domain: string }) {
  const items = populated ? (rows && rows.length ? rows.slice(0, 6) : Array.from({ length: 4 }, (_, i) => ({ name: `Product ${i + 1}`, price: (i + 1) * 19 }))) : Array.from({ length: 6 })
  return (
    <div style={{ height: "100%", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13, color: "#000" }}>{domain} · Shop</span>
        {populated && (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#999" }}>{(rows?.length ?? items.length)} items</span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 40, background: populated ? PALETTE[i % PALETTE.length] : "#ececec", opacity: populated ? 0.85 : 1 }} />
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {populated ? (
                <>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pick(item, ["name", "title", "label"], `Item ${i + 1}`)}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#0070f3", fontWeight: 600 }}>
                    ${pick(item, ["price", "cost", "amount"], String((i + 1) * 19))}
                  </span>
                </>
              ) : (
                <>
                  <Skeleton w="80%" h={6} />
                  <Skeleton w="40%" h={6} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
