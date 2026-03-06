import { GoogleGenAI, Type } from "@google/genai";
import { Tier } from "../core/models/types";

// Lazy initialization of Gemini Client
let ai: GoogleGenAI | null = null;

const getAIClient = (): GoogleGenAI => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

export interface AISuggestedProduct {
  name: string;
  description: string;
  suggestedOptions: {
    name: string;
    price: number;
    tier: string;
    sku: string;
  }[];
}

export interface ParsedCartItem {
  name: string;
  price: number;
  sku: string;
  description: string;
  category: string;
  brand: string;
  modelNumber: string;
}

export const parseCartText = async (text: string): Promise<ParsedCartItem[]> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following text which is a copy-paste from a Lowe's shopping cart or product list. 
      Extract a list of products. For each product, identify:
      - Name (full product title)
      - Price (numeric, per unit. If multiple prices found, use the main unit price)
      - Item Number (as SKU)
      - Model Number
      - Brand
      - Short Description (infer if not explicit)
      - Category (infer from name, e.g., 'Lighting', 'Plumbing', 'Flooring', 'Paint', 'Hardware', 'Appliances')
      
      Text to analyze:
      ${text.substring(0, 10000)}`, // Limit text length to avoid token limits if massive
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              sku: { type: Type.STRING },
              modelNumber: { type: Type.STRING },
              brand: { type: Type.STRING },
              description: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["name", "price", "sku", "category"]
          }
        }
      }
    });

    let jsonString = response.text || "";
    
    // Clean up markdown code blocks if present
    jsonString = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();

    // Try to find the array if there's extra text
    const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonString = arrayMatch[0];
    }

    if (jsonString) {
      return JSON.parse(jsonString) as ParsedCartItem[];
    }
    return [];
  } catch (error) {
    console.error("AI Parsing failed:", error);
    return [];
  }
};

export const generateRoomProducts = async (roomName: string): Promise<AISuggestedProduct[]> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a list of 5 essential maintenance/replacement products for a rental unit's "${roomName}". 
      For each product, provide 2 generic examples that might be found at Lowes (one Budget, one Standard).
      Fake the SKUs but make the prices realistic.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Generic product name (e.g., Faucet)" },
              description: { type: Type.STRING, description: "Short description of use" },
              suggestedOptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Specific product name example" },
                    price: { type: Type.NUMBER, description: "Approximate price" },
                    tier: { type: Type.STRING, description: "Budget, Standard, or Premium" },
                    sku: { type: Type.STRING, description: "A placeholder SKU" }
                  },
                  required: ["name", "price", "tier", "sku"]
                }
              }
            },
            required: ["name", "description", "suggestedOptions"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AISuggestedProduct[];
    }
    return [];
  } catch (error) {
    console.error("AI Generation failed:", error);
    return [];
  }
};