import type { CodeThemeId } from "./types"

export interface CodeTheme {
  id: CodeThemeId
  label: string
  bg: string
  headerBg: string
  border: string
  chrome: string // filename text color
  gutter: string // line number color
  colors: {
    plain: string
    keyword: string
    string: string
    number: string
    comment: string
    function: string
    tag: string
    punctuation: string
    property: string
  }
}

// VS Code-inspired palettes
export const CODE_THEMES: Record<CodeThemeId, CodeTheme> = {
  // Default Dark+ style
  dark: {
    id: "dark",
    label: "Dark+",
    bg: "#1e1e1e",
    headerBg: "#181818",
    border: "#2b2b2b",
    chrome: "#cccccc",
    gutter: "#6e7681",
    colors: {
      plain: "#d4d4d4",
      keyword: "#569cd6",
      string: "#ce9178",
      number: "#b5cea8",
      comment: "#6a9955",
      function: "#dcdcaa",
      tag: "#4ec9b0",
      punctuation: "#d4d4d4",
      property: "#9cdcfe",
    },
  },
  // Light+ style
  light: {
    id: "light",
    label: "Light+",
    bg: "#ffffff",
    headerBg: "#f3f3f3",
    border: "#e5e5e5",
    chrome: "#3b3b3b",
    gutter: "#a0a0a0",
    colors: {
      plain: "#1f1f1f",
      keyword: "#0000ff",
      string: "#a31515",
      number: "#098658",
      comment: "#008000",
      function: "#795e26",
      tag: "#267f99",
      punctuation: "#1f1f1f",
      property: "#0451a5",
    },
  },
  // Monokai style
  monokai: {
    id: "monokai",
    label: "Monokai",
    bg: "#272822",
    headerBg: "#1f201b",
    border: "#3a3b34",
    chrome: "#cfcfc2",
    gutter: "#75715e",
    colors: {
      plain: "#f8f8f2",
      keyword: "#f92672",
      string: "#e6db74",
      number: "#ae81ff",
      comment: "#75715e",
      function: "#a6e22e",
      tag: "#a6e22e",
      punctuation: "#f8f8f2",
      property: "#66d9ef",
    },
  },
}

export function getCodeTheme(id: CodeThemeId | undefined): CodeTheme {
  return CODE_THEMES[id ?? "dark"] ?? CODE_THEMES.dark
}

const KEYWORDS = new Set([
  "import",
  "export",
  "default",
  "function",
  "return",
  "const",
  "let",
  "var",
  "from",
  "class",
  "extends",
  "if",
  "else",
  "for",
  "while",
  "async",
  "await",
  "new",
  "type",
  "interface",
  "enum",
  "public",
  "private",
  "static",
  "void",
  "null",
  "undefined",
  "true",
  "false",
])

export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "tag"
  | "punctuation"
  | "property"

export interface Token {
  text: string
  kind: TokenKind
}

// Lightweight tokenizer — good enough to look like real editor highlighting
// for JS/TS/JSX snippets, without shipping a full parser.
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []

  // whole-line comment
  const trimmed = line.trimStart()
  if (trimmed.startsWith("//")) {
    return [{ text: line, kind: "comment" }]
  }

  // regex captures: strings | comments | numbers | jsx tags | identifiers | punctuation | whitespace
  const re =
    /(`[^`]*`|"[^"]*"|'[^']*')|(\/\/.*$)|(\b\d+(?:\.\d+)?\b)|(<\/?[A-Za-z][\w.]*)|([A-Za-z_$][\w$]*)|([{}()[\].,;:=+\-*/<>!&|?%]+)|(\s+)/g

  let match: RegExpExecArray | null
  let lastIndex = 0
  while ((match = re.exec(line)) !== null) {
    // any gap (unmatched chars) → plain
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: "plain" })
    }
    lastIndex = re.lastIndex

    const [, str, comment, num, tag, ident, punc, ws] = match
    if (str) tokens.push({ text: str, kind: "string" })
    else if (comment) tokens.push({ text: comment, kind: "comment" })
    else if (num) tokens.push({ text: num, kind: "number" })
    else if (tag) tokens.push({ text: tag, kind: "tag" })
    else if (ident) {
      if (KEYWORDS.has(ident)) tokens.push({ text: ident, kind: "keyword" })
      else {
        // function call heuristic: identifier immediately followed by "("
        const after = line[re.lastIndex]
        tokens.push({ text: ident, kind: after === "(" ? "function" : "plain" })
      }
    } else if (punc) tokens.push({ text: punc, kind: "punctuation" })
    else if (ws) tokens.push({ text: ws, kind: "plain" })
  }
  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: "plain" })
  }
  return tokens
}
