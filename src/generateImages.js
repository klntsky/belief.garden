// src/generateImages.js
import path from 'path';
import { generateImageForBelief, imageExists } from './generateImage.js';
import { readBeliefs } from './readBeliefs.js';

async function generateImages() {
  const beliefsData = readBeliefs();
  const outputFolder = path.join('public', 'img');

  for (const category of Object.keys(beliefsData)) {
    // if (category != 'Social Equality') {
    //   continue;
    // }
    for (const belief of beliefsData[category]) {
      const imagePath = path.join(outputFolder, `${belief.name}.webp`);
      if (!imageExists(imagePath)) {
        await generateImageForBelief(category, belief);
      } else {
        console.log(`Image already exists for belief: ${belief.name}`);
      }
    }
  }
}

generateImages();
