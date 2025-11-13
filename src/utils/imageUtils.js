import fs from 'fs';
import path from 'path';
import { ImageMagick, initializeImageMagick, MagickGeometry } from '@imagemagick/magick-wasm';

let imageMagickInitialized = false;

// Initialize ImageMagick (only once)
async function ensureImageMagickInitialized() {
  if (!imageMagickInitialized) {
    const wasmLocation = './node_modules/@imagemagick/magick-wasm/dist/magick.wasm';
    const wasmBytes = fs.readFileSync(wasmLocation);
    await initializeImageMagick(wasmBytes);
    imageMagickInitialized = true;
  }
}

// Compress a single image file
export async function compressSingleImage(imagePath) {
  await ensureImageMagickInitialized();

  const directory = path.dirname(imagePath);
  const filename = path.basename(imagePath, '.webp');
  const minDir = path.join(directory, 'min');

  // Create 'min' directory if it doesn't exist
  if (!fs.existsSync(minDir)) {
    fs.mkdirSync(minDir, { recursive: true });
  }

  // Check if the file exists
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  // Read the image file
  const inputData = fs.readFileSync(imagePath);

  return new Promise((resolve, reject) => {
    // Process the image
    ImageMagick.read(inputData, (img) => {
      try {
        // Resize the image to height 400px, maintaining aspect ratio
        img.resize(new MagickGeometry(0, 400));

        // Set the quality to 50
        img.quality = 50;

        // Write the image to buffer in webp format
        img.write('webp', (data) => {
          const outputPath = path.join(minDir, `${filename}.webp`);
          fs.writeFileSync(outputPath, data);
          resolve(outputPath);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

