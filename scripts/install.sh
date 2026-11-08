#!/bin/sh
# Installs (or updates) the Lucian Office apps and the repos they use.
# Run it from your lucianos folder, after cloning lucianoffice into apps/:
#   sh apps/lucianoffice/scripts/install.sh
# Apps go in lucianos/apps; the tools (mnns, vetusiapl2webpl) go beside lucianos.
set -e
if [ ! -f server.js ] || [ ! -d apps ]; then
  echo "Run this from your lucianos folder (the one with server.js and apps/)." >&2
  exit 1
fi
HERE=$(pwd)
TOOLS=$(dirname "$HERE")

get() {  # get <folder> <repo>
  if [ -d "$1/.git" ]; then
    echo "Updating $1"
    git -C "$1" pull --ff-only --quiet || echo "  (couldn't update $1: it has changes of its own)"
  else
    echo "Cloning $2 into $1"
    git clone --quiet "https://github.com/luciangreen/$2" "$1"
  fi
}

# Lucian Office apps (they sit side by side in apps/)
for app in lucianoffice writer glinspire chatbotappauthor counter presenter etcher tabler studio moviemr visualstarlog; do
  get "apps/$app" "$app"
done

# Tools the apps run as Prolog jobs (beside lucianos, like your other repos)
get "$TOOLS/mnns" mnns                         # Optimise with mnns (Lucian Office, fastos)
get "$TOOLS/vetusiapl2webpl" vetusiapl2webpl   # funnels (Tabler)

echo
echo "Done. Restart LucianOS (npm start) and open http://localhost:4170/."
echo "Lucian Office's apps are in the Apps menu. Their tools are in $TOOLS."
command -v swipl >/dev/null 2>&1 || echo "Note: SWI-Prolog (swipl) was not found. Install it for mnns, funnels and Tabler sites: brew install swi-prolog"
