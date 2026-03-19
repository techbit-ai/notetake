import { Type } from "@google/genai";

async function callGenerate(contents: any, config?: any, model?: string) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, config, model }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate content");
  }

  return await response.json();
}

async function callEmbed(contents: any, model?: string) {
  const response = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, model }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate embedding");
  }

  return await response.json();
}

export interface StructuredNote {
  summary: string;
  tags: string[];
  keyPoints: string[];
  category: string;
  actionItems: string[];
  cleanedContent: string;
}

export interface MergeSuggestion {
  mergedContent: string;
  reason: string;
}

export interface PatternInsight {
  title: string;
  description: string;
}

export interface WeeklyReport {
  topics: string[];
  patterns: { title: string; description: string }[];
  summary: string;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const result = await callEmbed([text]);
  return result.embeddings[0].values;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magA * magB);
}

export async function structureNote(content: string): Promise<StructuredNote> {
  const response = await callGenerate(
    `Structure the following micro-reading note or snippet into a clear format. 
    Also, perform a "typo cleanup" on the content to fix any obvious spelling or grammar issues while preserving the original meaning.
    Content: "${content}"`,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "A concise 1-sentence summary." },
          tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-5 relevant keywords." },
          keyPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Main takeaways." },
          category: { type: Type.STRING, description: "Broad category (e.g., Tech, Philosophy, Health)." },
          actionItems: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Potential next steps or applications." },
          cleanedContent: { type: Type.STRING, description: "The content with typos fixed and better formatting." }
        },
        required: ["summary", "tags", "keyPoints", "category", "actionItems", "cleanedContent"]
      }
    }
  );

  return JSON.parse(response.text || "{}");
}

export async function suggestMerge(noteA: string, noteB: string): Promise<MergeSuggestion> {
  const response = await callGenerate(
    `These two notes appear to be duplicates or very similar. Suggest a single merged version that captures the essence of both, and explain why they should be merged.
    Note A: "${noteA}"
    Note B: "${noteB}"`,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mergedContent: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ["mergedContent", "reason"]
      }
    }
  );
  return JSON.parse(response.text || "{}");
}

export async function askNotes(query: string, context: string[]): Promise<string> {
  console.log("Asking notes with query:", query, "and context size:", context.length);
  
  const response = await callGenerate(
    `Question: ${query}`,
    {
      systemInstruction: `You are a personal knowledge assistant. 
      Your task is to answer the user's question based ONLY on the provided notes from their knowledge base. 
      
      Knowledge Base Notes:
      ${context.map((n, i) => `[Note ${i + 1}]: ${n}`).join('\n\n')}`,
    }
  );
  
  const text = response.text;
  console.log("Received response from Lumina:", text);
  return text || "I couldn't find an answer in your notes.";
}

export async function detectPattern(noteA: string, noteB: string): Promise<PatternInsight | null> {
  const response = await callGenerate(
    `Analyze these two related ideas and detect a deeper pattern or connection between them. If there is a clear connection, provide a title for the pattern and a brief description. If the connection is weak, return null.
    Idea 1: "${noteA}"
    Idea 2: "${noteB}"`,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A catchy title for the pattern (e.g., 'The Momentum Principle')." },
          description: { type: Type.STRING, description: "A brief explanation of how these ideas connect." }
        },
        required: ["title", "description"]
      }
    }
  );
  try {
    return JSON.parse(response.text || "null");
  } catch {
    return null;
  }
}

export async function generateWeeklyReport(notes: string[]): Promise<WeeklyReport> {
  const response = await callGenerate(
    `Analyze the following notes captured over the past week and generate a "Your weekly knowledge report".
    Identify the main topics explored and detect deeper patterns or recurring themes across the notes.
    
    Notes:
    ${notes.join('\n---\n')}
    `,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Main topics explored this week." },
          patterns: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT, 
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["title", "description"]
            }, 
            description: "Key patterns or insights detected." 
          },
          summary: { type: Type.STRING, description: "A brief overall summary of the week's thinking." }
        },
        required: ["topics", "patterns", "summary"]
      }
    }
  );
  return JSON.parse(response.text || "{}");
}

export async function generateTopicInsight(topic: string, notes: string[]): Promise<string> {
  const response = await callGenerate(
    `Analyze these notes categorized under the topic "${topic}". 
    Detect a recurring theme or core philosophy that connects them. 
    Provide a concise, insightful synthesis (1-2 sentences).
    
    Notes:
    ${notes.join('\n---\n')}
    `,
    {
      systemInstruction: "You are a personal knowledge engine. Your goal is to provide deep, synthesized insights into a user's thinking patterns. Be profound but concise.",
    }
  );
  return response.text || "No specific theme detected yet.";
}

export interface EvolutionInsight {
  theme: string;
  evolution: string;
  milestones: { date: string; summary: string }[];
}

export async function generateEvolutionInsight(notes: { content: string; date: string }[]): Promise<EvolutionInsight> {
  const response = await callGenerate(
    `Analyze how this idea has evolved over time based on these notes. 
    Notes (ordered by date):
    ${notes.map(n => `[${n.date}]: ${n.content}`).join('\n---\n')}
    
    Provide:
    1. A core theme for this idea evolution.
    2. A brief explanation of how the thinking matured or shifted.
    3. A list of key milestones (summaries of the most important shifts).
    `,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING },
          evolution: { type: Type.STRING },
          milestones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                summary: { type: Type.STRING }
              },
              required: ["date", "summary"]
            }
          }
        },
        required: ["theme", "evolution", "milestones"]
      }
    }
  );
  return JSON.parse(response.text || "{}");
}
