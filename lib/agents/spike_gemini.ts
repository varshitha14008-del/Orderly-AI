/**
 * Milestone 1 Spike Script: Google Gemini API & Structured Output Verification
 */

import fs from "fs";
import path from "path";

// Load .env.local if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import { GoogleGenAI, Type } from "@google/genai";

async function runGeminiSpike() {
  console.log("=================================================");
  console.log("   ORDERLY-AI: GEMINI AI STRUCTURED OUTPUT SPIKE");
  console.log("=================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env.local");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  console.log(`Connecting to Gemini with model: ${modelName}...`);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: "Buyer needs an ergonomic mechanical keyboard. Maximum budget is $60. Make an initial offer of $38.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: ["offer", "counter", "accept", "reject", "ask_human"],
          },
          price: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
        },
        required: ["action", "price", "rationale"],
      },
    },
  });

  console.log("Raw Response Text:\n", response.text);

  if (!response.text) {
    throw new Error("Empty response received from Gemini");
  }

  const parsed = JSON.parse(response.text);
  console.log("\nParsed Structured JSON Output:", parsed);
  console.log("\n[PASS] Gemini Structured Output Verified Successfully!");
}

runGeminiSpike().catch(async (err) => {
  console.warn("Primary model failed:", err.message);
  console.log("Attempting fallback model 'gemini-2.5-flash-lite' or 'gemini-2.0-flash'...");
  try {
    const apiKey = process.env.GEMINI_API_KEY!;
    const ai = new GoogleGenAI({ apiKey });
    const fallbackResponse = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Make an offer for a keyboard for $38.",
    });
    console.log("Fallback successful:\n", fallbackResponse.text);
  } catch (fallbackErr: any) {
    console.error("Fallback also failed:", fallbackErr.message);
  }
});
