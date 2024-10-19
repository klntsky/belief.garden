#!/bin/bash

# Check if directory argument is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

DIRECTORY=$1

# Check if the directory exists
if [ ! -d "$DIRECTORY" ]; then
  echo "Directory not found!"
  exit 1
fi

mkdir -p "$DIRECTORY/min/"

# Loop over .webp files in the directory
for file in "$DIRECTORY"/*.webp; do
  if [ -f "$file" ]; then
    # Extract the filename without the extension
    filename=$(basename "$file" .webp)

    # Resize and compress the image
    convert "$file" -resize x400 -quality 50 "$DIRECTORY/min/$filename.webp"

    echo "Processed $file -> $filename.min.webp"
  else
    echo "No .webp files found in $DIRECTORY"
    exit 1
  fi
done

echo "All images processed!"
