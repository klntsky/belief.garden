// src/openaiClient.js
import OpenAIApi from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export function createOpenAIApi() {
  const openai = new OpenAIApi({
    apiKey: process.env.OPENAI_API_KEY, // API key from environment variables
  });
  return openai;
}
