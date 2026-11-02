#!/usr/bin/env bash
set -euo pipefail
umask 077
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
version=$(cat "$source_dir/VERSION")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || { echo 'Invalid VERSION.' >&2; exit 1; }
root=${ABB_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/agentic-browser-bridge}
bin=${ABB_BIN_DIR:-$HOME/.local/bin}
destination="$root/releases/$version"
[[ ! -e "$destination" ]] || { echo "CLI $version already installed at $destination; no files changed."; exit 0; }
# Refuse replacing an unrelated command. Existing ABB symlinks are intentionally upgraded.
if [[ -e "$bin/abb" || -L "$bin/abb" ]]; then
  current=$(readlink "$bin/abb" || true)
  [[ "$current" == "$root/releases/"*/scripts/abb ]] || { echo "Refusing to overwrite $bin/abb" >&2; exit 1; }
fi
mkdir -p "$root/releases" "$bin"
staging=$(mktemp -d "$root/releases/.install.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT
mkdir -p "$staging/scripts"
cp "$source_dir/scripts/abb" "$staging/scripts/abb"
cp "$source_dir/compose.yaml" "$source_dir/VERSION" "$staging/"
chmod +x "$staging/scripts/abb"
mv "$staging" "$destination"
ln -sfn "$destination/scripts/abb" "$bin/abb"
echo "Installed CLI $version at $bin/abb. Add $bin to PATH if needed."
echo 'Next: abb init [viewer-port]. No Docker settings, secrets, or services were changed.'
