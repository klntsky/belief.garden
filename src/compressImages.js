import fs from 'fs';
import path from 'path';
import { ImageMagick, initializeImageMagick, MagickGeometry } from '@imagemagick/magick-wasm';

(async () => {
  // Get the directory from command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(`Usage: node compressImages.js <directory>`);
    process.exit(1);
  }

  const directory = args[0];
  const wasmLocation = './node_modules/@imagemagick/magick-wasm/dist/magick.wasm';
  const wasmBytes = fs.readFileSync(wasmLocation);
   await initializeImageMagick(wasmBytes);

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

    // Read the image file
    const inputData = fs.readFileSync(filePath);

    // Process the image
    ImageMagick.read(inputData, (img) => {
      // Resize the image to height 400px, maintaining aspect ratio
      img.resize(new MagickGeometry(0, 400));

      // Set the quality to 50
      img.quality = 50;

      // Write the image to buffer in webp format
      img.write('webp', (data) => {
        const outputPath = path.join(minDir, `${filename}.webp`);
        fs.writeFileSync(outputPath, data);
        console.log(`Processed ${file} -> ${filename}.webp`);
      });
    });
  }

  console.log('All images processed!');
})();
