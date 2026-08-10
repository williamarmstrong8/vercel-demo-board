import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/**
 * Demo tool: shell access in the agent's sandbox.
 *
 * The sandbox is mocked in this playground, so this returns realistic sample
 * terminal output for a handful of common commands instead of executing
 * anything. Instructions tell the model to present the result as a preview.
 */
export default defineTool({
  description: "Run a shell command in the sandbox (preview: returns sample output).",
  inputSchema: z.object({ command: z.string() }),
  async execute({ command }) {
    if (!isToolEnabled("run_command")) return disabledResult("run_command")
    const cmd = command.trim()
    const first = cmd.split(/\s+/)[0]
    const canned: Record<string, string> = {
      pwd: "/workspace",
      whoami: "eve",
      ls: "README.md\npackage.json\nsrc\nnode_modules",
      date: new Date().toUTCString(),
      echo: cmd.replace(/^echo\s+/, "").replace(/^["']|["']$/g, ""),
      node: "v24.14.1",
      uname: "Linux eve-sandbox 6.1.0 x86_64 GNU/Linux",
    }
    const stdout = canned[first] ?? `${first}: sample output (sandbox is mocked in this demo)`
    return { command: cmd, stdout, stderr: "", exitCode: 0, preview: true }
  },
})
