import fs from 'fs';
import path from 'path';
import { blurImage } from './utils/imageUtils.js';

(async (): Promise<void> => {
  // Find an image to use for the demo
  const imgDir = './public/img';
  
  if (!fs.existsSync(imgDir)) {
    console.error('Image directory not found:', imgDir);
    process.exit(1);
  }

  // Get the first .webp file in the directory
  const files = fs.readdirSync(imgDir);
  const webpFiles = files.filter(file => path.extname(file).toLowerCase() === '.webp');
  
  if (webpFiles.length === 0) {
    console.error('No .webp files found in', imgDir);
    process.exit(1);
  }

  const demoImagePath = path.join(imgDir, webpFiles[0]!);
  console.log(`Applying blur to: ${demoImagePath}`);

  try {
    // Apply blur to the image
    const blurredImageData = await blurImage(demoImagePath);
    
    // Save the result as demo.png
    const outputPath = './demo.png';
    fs.writeFileSync(outputPath, blurredImageData);
    
    console.log(`Blur applied successfully! Saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error applying blur:', error);
    process.exit(1);
  }
})();

