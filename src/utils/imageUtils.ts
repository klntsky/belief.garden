import fs from 'fs';
import path from 'path';
import { ImageMagick, initializeImageMagick, MagickGeometry, MagickFormat } from '@imagemagick/magick-wasm';

let imageMagickInitialized = false;

// Initialize ImageMagick (only once)
async function ensureImageMagickInitialized(): Promise<void> {
  if (!imageMagickInitialized) {
    const wasmLocation = './node_modules/@imagemagick/magick-wasm/dist/magick.wasm';
    const wasmBytes = fs.readFileSync(wasmLocation);
    await initializeImageMagick(wasmBytes);
    imageMagickInitialized = true;
  }
}

// Apply blur to a rectangle from top 20% to bottom 40% of an image
// Returns the blurred image data as a buffer (does not overwrite the original)
export async function blurImage(imagePath: string): Promise<Uint8Array> {
  await ensureImageMagickInitialized();

  // Check if the file exists
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  // Read the image file and detect format from magic bytes
  const inputData = fs.readFileSync(imagePath);
  
  // Detect format from magic bytes
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  // WebP: RIFF ... WEBP
  let inputFormat: MagickFormat | undefined = undefined;
  if (inputData[0] === 0x89 && inputData[1] === 0x50 && inputData[2] === 0x4E && inputData[3] === 0x47) {
    inputFormat = MagickFormat.Png;
  } else if (inputData[0] === 0x52 && inputData[1] === 0x49 && inputData[2] === 0x46 && inputData[3] === 0x46) {
    inputFormat = MagickFormat.WebP;
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    // Stage 1: Blur the entire image
    // If format detected, use it; otherwise let ImageMagick auto-detect
    const readCallback = (blurredImg: any) => {
      try {
        const width = blurredImg.width;
        const height = blurredImg.height;
        
        // Calculate the region
        const topY = Math.floor(height * 0.13);
        const regionHeight = Math.floor(height * 0.6) - topY;

        // Apply gaussian blur to the entire image (radius 15, sigma 30 for very visible blur)
        blurredImg.gaussianBlur(15, 30);
        
        // Stage 2: Crop the blurred region and combine with original using pixel data
        // Read the original image again (use same format detection)
        const readOriginalCallback = (originalImg: any) => {
          try {
            // Crop the blurred image to get just the region we want
            blurredImg.crop(new MagickGeometry(0, topY, width, regionHeight));
            
            // Get pixels from the blurred region and copy them to the original image
            blurredImg.getPixels((blurredPixels) => {
              try {
                // Get pixels from the original image
                originalImg.getPixels((originalPixels) => {
                  try {
                    // Get pixel data from blurred region (entire cropped image)
                    const blurredData = blurredPixels.getArea(0, 0, width, regionHeight);
                    
                    // Set the pixel data in the original image at the correct position
                    originalPixels.setArea(0, topY, width, regionHeight, blurredData);
                    
                    // Write the final modified image to buffer in PNG format (universally readable)
                    originalImg.write('png' as any, (data: Uint8Array) => {
                      resolve(data);
                    });
                  } catch (error) {
                    reject(error);
                  }
                });
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            reject(error);
          }
        };
        
        // Read original image with format detection
        if (inputFormat) {
          ImageMagick.read(inputData, inputFormat, readOriginalCallback);
        } else {
          ImageMagick.read(inputData, readOriginalCallback);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    // Read blurred image with format detection
    if (inputFormat) {
      ImageMagick.read(inputData, inputFormat, readCallback);
    } else {
      ImageMagick.read(inputData, readCallback);
    }
  });
}

// Blur and compress a single image file
// If blurring fails, falls back to compression only
async function blurAndCompress(imagePath: string): Promise<string> {
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

  // Try to blur first, but fall back to compression if blur fails
  let imageDataToProcess: Uint8Array;
  let imageFormat: MagickFormat | undefined = undefined;
  let tempPath: string | null = null;

  try {
    // Try to apply blur
    const blurredImageData = await blurImage(imagePath);
    
    // Write blurred data to temp file and read it back (ImageMagick WASM may have issues reading PNG from buffer)
    tempPath = path.join(directory, `.temp_${filename}.png`);
    fs.writeFileSync(tempPath, blurredImageData);
    imageDataToProcess = fs.readFileSync(tempPath);
    // Blurred output is always PNG
    imageFormat = MagickFormat.Png;
  } catch (blurError) {
    // If blur fails, fall back to reading the original image
    console.warn(`Blur failed for ${imagePath}, falling back to compression only:`, blurError);
    imageDataToProcess = fs.readFileSync(imagePath);
    
    // Detect format from magic bytes for original image
    if (imageDataToProcess[0] === 0x89 && imageDataToProcess[1] === 0x50 && imageDataToProcess[2] === 0x4E && imageDataToProcess[3] === 0x47) {
      imageFormat = MagickFormat.Png;
    } else if (imageDataToProcess[0] === 0x52 && imageDataToProcess[1] === 0x49 && imageDataToProcess[2] === 0x46 && imageDataToProcess[3] === 0x46) {
      imageFormat = MagickFormat.WebP;
    }
  }

  return new Promise<string>((resolve, reject) => {
    try {
      // Process the image (blurred or original) with format detection
      const readCallback = (img: any) => {
        try {
          // Resize the image to height 400px, maintaining aspect ratio
          img.resize(new MagickGeometry(0, 400));

          // Set the quality to 50
          img.quality = 50;

          // Write the image to buffer in webp format
          img.write('webp' as any, (data: Uint8Array) => {
            const outputPath = path.join(minDir, `${filename}.webp`);
            fs.writeFileSync(outputPath, data);
            resolve(outputPath);
          });
        } catch (error) {
          reject(error);
        }
      };
      
      if (imageFormat) {
        ImageMagick.read(imageDataToProcess, imageFormat, readCallback);
      } else {
        ImageMagick.read(imageDataToProcess, readCallback);
      }
    } catch (error) {
      reject(error);
    } finally {
      // Clean up temp file if it was created
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });
}

// Compress a single image file
// Applies blur to the region first, then downscales
// Falls back to compression only if blurring fails
export async function compressSingleImage(imagePath: string): Promise<string> {
  return blurAndCompress(imagePath);
}

