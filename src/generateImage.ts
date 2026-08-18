// src/generateImage.ts
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { resolveContainedFile, UnsafePathError } from './utils/fileUtils.js';

dotenv.config();

const outputFolder = path.join('public', 'img');
const previewFolder = path.join(outputFolder, 'previews');
const IMAGE_MODEL = 'gpt-image-2';
const IMAGE_QUALITY = process.env.NODE_ENV === 'test' ? 'low' : 'medium';
const ALLOWED_IMAGE_HOSTS = new Set(
  (process.env.ALLOWED_IMAGE_HOSTS || 'oaidalleapiprodscus.blob.core.windows.net')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
);
const additionalPrompts: Record<string, string> = {
  'Philosophy of Will': 'image style: use pink yellow or red colors, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Philosophy of Life': 'image style: use grey-ish cold colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Philosophy of Mind': 'image style: use pastel colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Economics': 'image style: use yellow, golden and green or red colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Software': 'image style: use dark grey and organge colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Software Development': 'image style: use dark grey and orange colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Software Methodology': 'image style: use dark grey and teal colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Politics': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Art': 'image style: very artsy, unusual, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Rationality': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Religious Philosophy': 'image style: use red, grey and blue colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Workplace Culture': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft, colors: blue, green, golden',
  'Education Philosophy': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft, colors: pink and black',
  'Education': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft, colors: pink and black',
  'Parenting': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, colors: pink and yellow',
  'Community Living': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, pastoral, relaxed, a lot of sun, colors: yellow and bright green',
  'Conflict Resolution': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, anxious, colors: red and brown',
  'Gender Roles and Identity': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, blue and pink colors',
  'Healthcare': 'image style: PIXAR 3d cartoon style doctors, abstract imagery, with smooth gradients and gentle lighting, soft, white colors, and red cross',
  'Cultural Integration': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, anxious, colors: gold and silver',
  'Inter-personal Relations': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, anxious, colors: white and blue',
  'Social Equality': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, tragic, colors: black and white',
  'Software Licensing': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, tragic, colors: orange, grey, white',
  'Personal Finance': 'image style: PIXAR 3d cartoon style people, finance-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, colors: green, white, golden, silver',
  'Cryptocurrency': 'image style: PIXAR 3d cartoon style people, finance-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, colors: golden, silver, orange',
  'Privacy': 'image style: PIXAR 3d cartoon style people, safety-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, colors: blue, white, dark green',
  'Reproductive Rights and Family Law': 'image style: PIXAR 3d cartoon style people, safety-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, colors: pink, red, white',
  'Freedom of Expression': 'image style: PIXAR 3d cartoon style people, safety-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, all possible colors',
  'A Different Future': 'image style: PIXAR 3d cartoon style people, safety-related, abstract imagery with smooth gradients and gentle lighting, soft, tragic, all possible colors',
  'Intellectual Property': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, tragic, colors: orange, grey, white. humans doing paperwork',
  'Criminal Justice': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, tragic, colors: red, brown, grey. sad humans',
  'Military Service': 'image style: PIXAR 3d cartoon style people, abstract imagery, with smooth gradients and gentle lighting, soft, tragic, dark colors: dark green, brown. heroic humans',
  'Role of a Nation': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Ecology': 'image style: PIXAR 3d cartoon style nature, abstract imagery, with smooth gradients and gentle lighting, soft, colors: green, teal, earth brown, sky blue',
  'Eating habits': 'image style: PIXAR 3d cartoon style food and people, abstract imagery, with smooth gradients and gentle lighting, soft, colors: warm yellow, orange, green, red',
};

interface Belief {
  name: string;
  description: string;
}

// Check if an image already exists
export function imageExists(imagePath: string): boolean {
  return fs.existsSync(imagePath);
}

// Generate the image URL by calling OpenAI's API (without downloading)
export async function generateImageUrlForBelief(category: string, belief: Belief, customAdditionalPrompt: string | null = null): Promise<string> {
  const categoryPrompt = additionalPrompts[category];
  
  // Combine category prompt and custom prompt
  const additionalPromptParts: string[] = [];
  
  if (categoryPrompt) {
    additionalPromptParts.push(categoryPrompt);
  }
  
  if (customAdditionalPrompt && customAdditionalPrompt.trim()) {
    additionalPromptParts.push(customAdditionalPrompt.trim());
  }
  
  if (additionalPromptParts.length === 0) {
    throw new Error(`No additional prompt for ${category}`);
  }

  const additionalPrompt = additionalPromptParts.join(' ');
  
  const prompt = `generate me an abstract pixarified unreal engine 3d cartoon image on the topic of ${belief.name} - use this text for inspiration, but not literally: "${belief.description}". ${additionalPrompt}`;
  console.log(`Generating image URL for belief: ${belief.name} (model: ${IMAGE_MODEL}, quality: ${IMAGE_QUALITY})`);

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      // node-fetch v2 gunzip truncated large GPT Image payloads
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify({
      prompt: prompt,
      model: IMAGE_MODEL,
      n: 1,
      size: '1024x1024',
      quality: IMAGE_QUALITY,
      output_format: 'webp',
    }),
  });

  const data = await response.json() as {
    data?: Array<{ url?: string; b64_json?: string }>;
    error?: { message: string };
  };
  const loggedData = {
    ...data,
    data: data.data?.map((item) => ({
      ...item,
      b64_json: item.b64_json ? `[${item.b64_json.length} chars]` : undefined,
    })),
  };
  console.log('API Response:', JSON.stringify(loggedData, null, 2));

  // Check if the API returned an error
  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${data.error?.message || 'Unknown error'}`);
  }

  const image = data.data?.[0];
  if (image?.b64_json) {
    fs.mkdirSync(previewFolder, { recursive: true });
    const filename = `preview-${Date.now()}.webp`;
    const previewPath = path.join(previewFolder, filename);
    fs.writeFileSync(previewPath, Buffer.from(image.b64_json, 'base64'));
    console.log(`Preview image saved: ${previewPath}`);
    return `/img/previews/${filename}`;
  }

  const imageUrl = image?.url;
  if (!imageUrl) {
    throw new Error('No image data returned by OpenAI API.');
  }

  return imageUrl;
}

// Generate the image by calling OpenAI's API with a POST request
export async function generateImageForBelief(category: string, belief: Belief, customAdditionalPrompt: string | null = null): Promise<void> {
  try {
    const imageUrl = await generateImageUrlForBelief(category, belief, customAdditionalPrompt);
    await downloadImageFromUrl(imageUrl, belief.name);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to generate image for belief: ${belief.name}`, errorMessage);
    throw error;
  }
}

// Download image from URL and save it locally
export async function downloadImageFromUrl(imageUrl: string, beliefName: string): Promise<void> {
  let imagePath: string;
  try {
    imagePath = resolveContainedFile(outputFolder, `${beliefName}.webp`);
  } catch (error) {
    if (error instanceof UnsafePathError) {
      throw new Error('Invalid belief name');
    }
    throw error;
  }

  if (imageUrl.startsWith('/img/')) {
    const previewMatch = /^\/img\/previews\/([a-zA-Z0-9._-]+\.webp)$/.exec(imageUrl);
    if (!previewMatch?.[1]) {
      throw new Error('Invalid image URL');
    }
    const sourcePath = resolveContainedFile(previewFolder, previewMatch[1]);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Preview image not found: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, imagePath);
    console.log(`Image copied from preview: ${imagePath}`);
    return;
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(imageUrl);
  } catch {
    throw new Error('Invalid image URL');
  }
  if (remoteUrl.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(remoteUrl.hostname.toLowerCase())) {
    throw new Error('Image host is not allowed');
  }

  const imageResponse = await fetch(remoteUrl, { redirect: 'manual' });

  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: HTTP ${imageResponse.status} ${imageResponse.statusText}`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  fs.writeFileSync(imagePath, imageBuffer);
  console.log(`Image downloaded and saved: ${imagePath}`);
}

