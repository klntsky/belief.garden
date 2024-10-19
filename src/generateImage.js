// src/generateImage.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const outputFolder = path.join('public', 'img');
// const additionalPrompt = 'image style: use various (warm and cold and green) colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft';

const additionalPrompts = {
  'Philosophy of Will': 'image style: use pink yellow or red colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Philosophy of Mind': 'image style: use pastel colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Economics': 'image style: use yellow, golden and green or red colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Software': 'image style: use dark grey and organge colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Politics': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Art': 'image style: very artsy, unusual, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Rationality': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Software': 'image style: very intellectual, unusual, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, colors: orange and grey',
  'Religious Philosophy': 'image style: use red, grey and blue colors, PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft',
  'Workplace Culture': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft, colors: blue, green, golden',
  'Education Philosophy': 'image style: very intellectual, unusual, PIXAR 3d cartoon style humans, abstract imagery, with smooth gradients and gentle lighting, soft, colors: pink and black',
  'Parenting Styles': 'image style: PIXAR 3d cartoon style, abstract imagery, with smooth gradients and gentle lighting, soft, colors: pink and yellow',
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
};

// Check if an image already exists
export function imageExists(imagePath) {
  return fs.existsSync(imagePath);
}

// Generate the image by calling OpenAI's API with a POST request
export async function generateImageForBelief(category, belief) {
  try {
    const additionalPrompt = additionalPrompts[category];
    if (!additionalPrompt) {
      // throw new Error(`No additional prompt for ${category}`);
      console.log(`No additional prompt for ${category}`);
      return;
    }
    const prompt = `generate me an abstract pixarified unreal engine 3d cartoon image on the topic of ${belief.name} - use this text for inspiration, but not literally: "${belief.description}". ${additionalPrompt}`;
    console.log(`Generating image for belief: ${belief.name}`);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Ensure the API key is set
      },
      body: JSON.stringify({
        prompt: prompt,
        model: 'dall-e-3',
        // style: 'vivid',
        // quality: 'hd',
        n: 1,
        size: '1024x1024',
      }),
    });

    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));

    // Check if the API returned an error
    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${data.error.message}`);
    }

    const imageUrl = data.data[0].url;

    if (!imageUrl) {
      throw new Error('No image URL returned by OpenAI API.');
    }

    const imagePath = path.join(outputFolder, `${belief.name}.webp`);

    // Download the image and save it locally
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.buffer();
    fs.writeFileSync(imagePath, imageBuffer);
    console.log(`Image saved: ${imagePath}`);
  } catch (error) {
    console.error(`Failed to generate image for belief: ${belief.name}`, error.message);
  }
}
