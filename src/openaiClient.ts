// src/openaiClient.ts
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export function createOpenAIApi(): OpenAI {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // API key from environment variables
  });
  return openai;
}

