import chatgpt from "../services/chatgpt.json";
import claude from "../services/claude.json";
import gemini from "../services/gemini.json";
import grok from "../services/grok.json";
import perplexity from "../services/perplexity.json";

export interface ServiceDef {
  id: string;
  name: string;
  url: string;
  partition: string;
  selectors: { input: string; send: string; response: string; fileInput?: string };
}

export const SERVICES: ServiceDef[] = [chatgpt, claude, gemini, grok, perplexity];

/** Day 1 검증 대상 3종 */
export const DAY1_SERVICE_IDS = ["chatgpt", "claude", "gemini"] as const;
