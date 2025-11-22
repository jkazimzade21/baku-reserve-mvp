import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execa } from "execa";
import path from "node:path";
import { z } from "zod";

const server = new McpServer({ name: "baku-enricher-mcp", version: "1.0.0" });

server.registerTool(
  "enrich_restaurant",
  {
    title: "Enrich Restaurant",
    description: "Enrich a Baku restaurant by name (maps, menu, IG, tags, 3 food + 2 interior photos)",
    inputSchema: {
      name: z.string().describe("Restaurant name (assumed to be in Baku)"),
      outDir: z.string().optional().describe("Output directory for JSON/assets (relative to repo root)"),
      downloadImages: z.boolean().optional().describe("Download selected images locally instead of keeping remote URLs"),
      minConfidence: z.number().optional().describe("Minimum acceptable confidence before flagging needs_review"),
      limitPosts: z.number().int().optional().describe("Max Instagram posts to scan")
    }
  },
  async (input) => {
    const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..", "..");
    const scriptPath = `${repoRoot}/tools/baku_enricher/enrich.py`;
    const pythonBin = `${repoRoot}/tools/baku_enricher/.venv/bin/python`;

    const outDir = input.outDir ?? "out/restaurants";
    const downloadImages = input.downloadImages ?? false;
    const minConfidence = typeof input.minConfidence === "number" ? input.minConfidence : 0.7;
    const limitPosts = typeof input.limitPosts === "number" ? input.limitPosts : 60;

    const args = [scriptPath, input.name, "--out-dir", outDir];
    if (downloadImages) {
      args.push("--download-images");
    }
    if (minConfidence !== undefined) {
      args.push("--min-confidence", String(minConfidence));
    }
    if (limitPosts !== undefined) {
      args.push("--limit-posts", String(limitPosts));
    }

    const { stdout } = await execa(pythonBin, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1"
      }
    });

    return {
      content: [
        {
          type: "text",
          text: stdout
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
