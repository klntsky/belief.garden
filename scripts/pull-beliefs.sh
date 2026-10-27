#!/usr/bin/env bash
set -euo pipefail

remote="${REMOTE:-web@ded}"
remote_dir="${REMOTE_DIR:-/home/web/belief.garden}"
root="$(cd "$(dirname "$0")/.." && pwd)"

beliefs_src="$root/public/static/beliefs.json"
img_dir="$root/public/img"
min_dir="$img_dir/min"
mkdir -p "$img_dir" "$min_dir" "$(dirname "$beliefs_src")"
download="$(mktemp "${beliefs_src}.XXXXXX")"
list="$(mktemp)"
trap 'rm -f "$list" "$download"' EXIT

printf -v remote_command 'cd %q && node --import tsx --input-type=module' "$remote_dir"
echo "Pulling beliefs from SQLite at $remote:$remote_dir"
ssh "$remote" "$remote_command" > "$download" <<'JS'
import { readRecord } from './src/storage.ts';
process.stdout.write(readRecord('data/beliefs.json'));
JS

(
  cd "$root"
  node --import tsx --input-type=module - "$download" "$list" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { assertSafePathSegment } from './src/utils/fileUtils.ts';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid belief catalog');
const names = [];
for (const items of Object.values(data)) {
  if (!Array.isArray(items)) throw new Error('Invalid belief category');
  for (const belief of items) {
    if (!belief || typeof belief !== 'object' || typeof belief.name !== 'string') throw new Error('Invalid belief');
    assertSafePathSegment(belief.name);
    names.push(`${belief.name}.webp`);
  }
}
writeFileSync(process.argv[3], names.length ? `${names.join('\n')}\n` : '');
console.log(`${names.length} belief images to sync`);
JS
)

echo "Pulling public/img/*.webp"
rsync -azP --files-from="$list" "$remote:$remote_dir/public/img/" "$img_dir/"

echo "Pulling public/img/min/*.webp"
rsync -azP --files-from="$list" "$remote:$remote_dir/public/img/min/" "$min_dir/"

(
  cd "$root"
  node --import tsx --input-type=module - "$download" <<'JS'
import { readFileSync } from 'node:fs';
import { transaction, writeRecord } from './src/storage.ts';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
transaction(() => writeRecord('data/beliefs.json', JSON.stringify(data, null, 2)));
JS
)
mv "$download" "$beliefs_src"

echo "Done."
