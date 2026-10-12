import fs from 'fs';
import path from 'path';
import { ImageMagick, MagickGeometry } from '@imagemagick/magick-wasm';
import { blurImage } from './utils/imageUtils.js';

(async (): Promise<void> => {
  // Get the directory from command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(`Usage: node compressImages.js <directory>`);
    process.exit(1);
  }

  const directory = args[0]!;

  // Check if the directory exists
  if (!fs.existsSync(directory)) {
    console.error('Directory not found!');
    process.exit(1);
  }

  const minDir = path.join(directory, 'min');

  // Create 'min' directory if it doesn't exist
  if (!fs.existsSync(minDir)) {
    fs.mkdirSync(minDir, { recursive: true });
  }

  // Read the directory contents
  const files = fs.readdirSync(directory);
  const webpFiles = files.filter(file => path.extname(file).toLowerCase() === '.webp');

  if (webpFiles.length === 0) {
    console.log(`No .webp files found in ${directory}`);
    process.exit(1);
  }

  for (const file of webpFiles) {
    const filePath = path.join(directory, file);
    const filename = path.basename(file, '.webp');

    try {
      // First, apply blur to the image
      const blurredImageData = await blurImage(filePath);

      // Write blurred data to temp file and read it back (ImageMagick WASM may have issues reading PNG from buffer)
      const tempPath = path.join(directory, `.temp_${filename}.png`);
      fs.writeFileSync(tempPath, blurredImageData);

      try {
        // Read from temp file
        const tempData = fs.readFileSync(tempPath);
        
        // Process the blurred image
        ImageMagick.read(tempData, (img) => {
        // Resize the image to height 400px, maintaining aspect ratio
        img.resize(new MagickGeometry(0, 400));

        // Set the quality to 50
        img.quality = 50;

          // Write the image to buffer in webp format
          img.write('webp' as any, (data: Uint8Array) => {
            const outputPath = path.join(minDir, `${filename}.webp`);
            fs.writeFileSync(outputPath, data);
            console.log(`Processed ${file} -> ${filename}.webp`);
          });
        });
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log('All images processed!');
})();

