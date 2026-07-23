import OpenAI from "openai";
import { appConfig, assertOpenAIConfigured } from "@/lib/config";

export function createOpenAIClient() {
  assertOpenAIConfigured();
  return new OpenAI({ apiKey: appConfig.openaiApiKey });
}
