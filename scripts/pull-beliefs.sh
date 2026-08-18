#!/usr/bin/env bash
set -euo pipefail

remote="${REMOTE:-web@ded}"
remote_dir="${REMOTE_DIR:-/home/web/belief.garden}"
root="$(cd "$(dirname "$0")/.." && pwd)"

beliefs_src="$root/public/static/beliefs.json"
img_dir="$root/public/img"
min_dir="$img_dir/min"
list="$(mktemp)"
trap 'rm -f "$list"' EXIT

mkdir -p "$img_dir" "$min_dir" "$root/data"

echo "Pulling beliefs.json from $remote:$remote_dir"
rsync -azP "$remote:$remote_dir/data/beliefs.json" "$beliefs_src"
cp "$beliefs_src" "$root/data/beliefs.json"

python3 - "$beliefs_src" "$list" <<'PY'
import json, sys
path, out = sys.argv[1], sys.argv[2]
data = json.load(open(path))
names = []
for items in data.values():
    if not isinstance(items, list):
        continue
    for belief in items:
        name = belief.get("name")
        if isinstance(name, str) and name:
            names.append(f"{name}.webp")
open(out, "w").write("\n".join(names) + ("\n" if names else ""))
print(f"{len(names)} belief images to sync")
PY

echo "Pulling public/img/*.webp"
rsync -azP --files-from="$list" "$remote:$remote_dir/public/img/" "$img_dir/"

echo "Pulling public/img/min/*.webp"
rsync -azP --files-from="$list" "$remote:$remote_dir/public/img/min/" "$min_dir/"

echo "Done."
