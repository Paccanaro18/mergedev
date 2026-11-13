import assert from "node:assert/strict";
import { test } from "node:test";
import { detectOs } from "./detect-os.ts";

const UA = {
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  linux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  chromeos:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

test("detecta Windows, macOS e Linux", () => {
  assert.equal(detectOs({ userAgent: UA.windows, platform: "Win32" }), "windows");
  assert.equal(detectOs({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 }), "macos");
  assert.equal(detectOs({ userAgent: UA.linux, platform: "Linux x86_64" }), "linux");
});

test("usa userAgentData quando existe", () => {
  assert.equal(
    detectOs({ userAgent: UA.windows, userAgentData: { platform: "Windows" } }),
    "windows",
  );
});

test("não destaca nada em celular, tablet ou ChromeOS", () => {
  assert.equal(detectOs({ userAgent: UA.android, platform: "Linux armv81" }), null);
  assert.equal(detectOs({ userAgent: UA.iphone, platform: "iPhone" }), null);
  assert.equal(detectOs({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 5 }), null);
  assert.equal(detectOs({ userAgent: UA.chromeos, platform: "Linux x86_64" }), null);
});

test("retorna null para sistema desconhecido", () => {
  assert.equal(detectOs({ userAgent: "curl/8.0", platform: "" }), null);
});
