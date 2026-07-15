import type { CanvasElement, Connection, HttpMethod } from "./types"

/** Simulated deployment origin — we never surface localhost in the preview. */
export const DEMO_ORIGIN = "https://demo-project.vercel.app"

/**
 * Resolved "what comes before me" context for a workflow node. Website and
 * server nodes use this to visualize the API route defined by an upstream
 * code block (or the endpoint defined by an upstream server node).
 */
export interface ApiContext {
  method: HttpMethod
  path: string // e.g. /api/users
  url: string // e.g. http://localhost:3000/api/users
  json: string // simulated response body (pretty-printed text)
  sourceType: "code" | "server"
  sourceTitle?: string
  // Ordered labels describing the whole upstream chain, from the API source
  // down to the node directly feeding this one. Lets a node visualize the
  // entire process (e.g. ["app/api/users/route.ts", "GET /api/users"]).
  chain: string[]
}

/** Human-readable label for a node, used to describe the chain. */
export function nodeLabel(el: CanvasElement): string {
  switch (el.type) {
    case "code":
      return el.title || "code"
    case "terminal":
      return el.title || "terminal"
    case "server":
      return `${el.method || "GET"} ${el.endpoint || "/api/hello"}`
    case "website":
      return el.url ? el.url : "website"
    default:
      return el.type
  }
}

/** The node directly feeding into `el` (the `from` side of an incoming edge). */
export function getUpstream(
  el: CanvasElement,
  elements: CanvasElement[],
  connections: Connection[],
): CanvasElement | null {
  const conn = connections.find((c) => c.to === el.id)
  if (!conn) return null
  return elements.find((e) => e.id === conn.from) ?? null
}

function defaultJson(path: string): string {
  return `{
  "ok": true,
  "route": "${path}",
  "data": []
}`
}

/**
 * Pull the first object/array literal passed to a `.json(...)` call out of the
 * source so we can render it as the simulated response body.
 */
function extractJson(text: string): string | null {
  const call = /\.json\s*\(/.exec(text)
  if (!call) return null
  let i = text.indexOf("(", call.index)
  if (i === -1) return null
  // advance to the first { or [ inside the call
  i++
  while (i < text.length && text[i] !== "{" && text[i] !== "[") {
    if (text[i] === ")") return null
    i++
  }
  if (i >= text.length) return null
  const open = text[i]
  const close = open === "{" ? "}" : "]"
  let depth = 0
  let j = i
  for (; j < text.length; j++) {
    if (text[j] === open) depth++
    else if (text[j] === close) {
      depth--
      if (depth === 0) {
        j++
        break
      }
    }
  }
  const raw = text.slice(i, j).trim()
  if (!raw) return null
  // most route handlers use JS object literals (unquoted keys) so JSON.parse
  // usually fails — in that case just show the literal as written.
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** Derive method + route path + response body from a code block. */
function detectRoute(code: CanvasElement): { method: HttpMethod; path: string; json: string } {
  const text = code.text ?? ""
  const title = code.title ?? ""

  // HTTP method from an exported route handler
  const m = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.exec(text)
  const method = (m?.[1] as HttpMethod) ?? "GET"

  // route path: prefer an explicit app/api/.../route path in the source,
  // otherwise derive one from the file name in the title.
  let path = ""
  const routeMatch = /app\/api\/([\w\-/[\]]+?)\/route\.[jt]sx?/.exec(text)
  if (routeMatch) {
    path = "/api/" + routeMatch[1]
  } else {
    const clean = title
      .trim()
      .replace(/\.[jt]sx?$/, "")
      .replace(/\/?route$/, "")
      .replace(/^app\//, "")
      .replace(/^\/+/, "")
    if (!clean) path = "/api/hello"
    else if (clean.startsWith("api/") || clean === "api") path = "/" + clean
    else path = "/api/" + clean
  }

  const json = extractJson(text) ?? defaultJson(path)
  return { method, path, json }
}

/**
 * Walk upstream from `el` to find the nearest node that defines an API: a code
 * block (richest) or, failing that, a server node. Returns null when there is
 * nothing API-like feeding into this node.
 */
export function getApiContext(
  el: CanvasElement,
  elements: CanvasElement[],
  connections: Connection[],
): ApiContext | null {
  // Collect the upstream path (nearest node first) so we understand the whole
  // chain feeding into this node, not just the immediate predecessor.
  const path: CanvasElement[] = []
  let current: CanvasElement | null = el
  const visited = new Set<string>([el.id])
  for (let hop = 0; hop < 24 && current; hop++) {
    const up = getUpstream(current, elements, connections)
    if (!up || visited.has(up.id)) break
    visited.add(up.id)
    path.push(up)
    current = up
  }
  if (path.length === 0) return null

  // Source-first order (furthest upstream → nearest). The chain we display.
  const sourceFirst = [...path].reverse()
  const chain = sourceFirst.map(nodeLabel)

  // Prefer the nearest code block as the API source (richest info); otherwise
  // fall back to the nearest server node that defines an endpoint.
  const code = path.find((n) => n.type === "code")
  if (code) {
    const r = detectRoute(code)
    return {
      ...r,
      url: `${DEMO_ORIGIN}${r.path}`,
      sourceType: "code",
      sourceTitle: code.title,
      chain,
    }
  }

  const server = path.find((n) => n.type === "server")
  if (server) {
    const p = server.endpoint || "/api/hello"
    return {
      method: server.method || "GET",
      path: p,
      url: `${DEMO_ORIGIN}${p}`,
      json: defaultJson(p),
      sourceType: "server",
      sourceTitle: server.endpoint,
      chain,
    }
  }

  return null
}

/** Website "shells" a code block can drive. Mirrors WebsiteTemplate minus "api". */
export type InferredWebsite = "marketing" | "dashboard" | "login" | "products"

/**
 * Infer which website shell best represents a code block's purpose from its
 * title + source. This is what lets the website nodes in a flow reflect the
 * code block: swap the code for an auth handler and the pages become login
 * screens; swap it for a products query and they become a storefront.
 */
export function detectWebsiteTemplate(code: CanvasElement): InferredWebsite {
  const hay = `${code.title ?? ""}\n${code.text ?? ""}`.toLowerCase()
  if (/\bauth|login|sign[\s-]?in|signin|session|token|password|credential/.test(hay)) return "login"
  if (/product|shop|store|cart|catalog|checkout|inventory|\bprice/.test(hay)) return "products"
  if (/metric|analytic|dashboard|\bstat|\bevent|revenue|chart|report/.test(hay)) return "dashboard"
  if (/content|headline|hero|landing|marketing|\bcta\b|subheadline|tagline/.test(hay)) return "marketing"
  return "marketing"
}

/**
 * Find the nearest code block connected to `el` in EITHER direction. Unlike
 * getApiContext (which only walks upstream to resolve data), a website may sit
 * before the code block in the flow, so we breadth-first search the undirected
 * connection graph to find the code node driving this part of the workflow.
 */
export function getConnectedCode(
  el: CanvasElement,
  elements: CanvasElement[],
  connections: Connection[],
): CanvasElement | null {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const adj = new Map<string, string[]>()
  for (const c of connections) {
    adj.set(c.from, [...(adj.get(c.from) ?? []), c.to])
    adj.set(c.to, [...(adj.get(c.to) ?? []), c.from])
  }
  const seen = new Set<string>([el.id])
  let frontier = [el.id]
  for (let hop = 0; hop < 24 && frontier.length; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (seen.has(nb)) continue
        seen.add(nb)
        const node = byId.get(nb)
        if (node?.type === "code") return node
        next.push(nb)
      }
    }
    frontier = next
  }
  return null
}

export const METHOD_COLORS: Record<string, string> = {
  GET: "#28c840",
  POST: "#febc2e",
  PUT: "#0070f3",
  DELETE: "#ff5f57",
  PATCH: "#8f8f8f",
}
