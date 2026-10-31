#!/usr/bin/env bash
# Shared GitHub Actions browser setup. Prefer the runner's already-installed
# Google Chrome when it passes an actual Playwright launch. This avoids
# relying on the separate Chromium CDN and apt mirror for every sync/deploy.
set -euo pipefail

retry() {
  local attempt
  for attempt in 1 2 3; do
    if "$@"; then return 0; fi
    echo "::warning::Attempt ${attempt}/3 failed: $*"
    if (( attempt < 3 )); then sleep $((attempt * 3)); fi
  done
  return 1
}

retry npm install --no-save --package-lock=false --no-audit --no-fund playwright@1.56.1

probe() {
  node --input-type=module -e '
    import {chromium} from "playwright";
    const executablePath=process.env.PROMO_CHROME_EXECUTABLE;
    const browser=await chromium.launch({
      headless:true,...(executablePath?{executablePath}:{})
    });
    try {
      const page=await browser.newPage();
      await page.goto("about:blank");
      console.log("[browser] Playwright launched "+browser.version());
    } finally {
      await browser.close();
    }
  '
}

for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
  path="$(command -v "$candidate" || true)"
  if [[ -z "$path" ]]; then continue; fi
  echo "[browser] Checking runner-installed browser: $path"
  if PROMO_CHROME_EXECUTABLE="$path" probe; then
    # The GitHub runner writes these values to following steps only after a
    # successful actual browser launch; never leave an untested override.
    if [[ -n "${GITHUB_ENV:-}" ]]; then
      printf 'PROMO_CHROME_EXECUTABLE=%s\n' "$path" >> "$GITHUB_ENV"
    fi
    exit 0
  fi
done

echo "[browser] No usable system Chrome. Installing matching Playwright Chromium."
if retry npx playwright install chromium && probe; then
  exit 0
fi
echo "[browser] Bundled Chromium did not launch; attempting missing Linux deps."
if retry npx playwright install --with-deps chromium && probe; then
  exit 0
fi
echo "::error title=Chromium indisponible::Neither system Chrome nor Playwright Chromium passed the launch probe; browser coverage was NOT performed."
exit 1
