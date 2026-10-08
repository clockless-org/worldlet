#pragma once
// Native URL facts of the website panel, identical to platform/electron/src/modules/browser/rules.ts
// (publicPage, signInPage, httpsUpgrade, popupAllowed, opensAsTab). Chromium decides navigations and popups synchronously, so
// the engine answers them itself; the host replays contracts/fixtures/parity/browser-public-page.json
// (with its `upgraded` addresses) browser-popup.json and browser-tab.json against these functions (the `policy` message, ../README.md#checks).
#include <string>

constexpr int kMaxPopups = 4;
bool PublicPage(const std::string& url);
bool SignInPage(const std::string& url);
// The https:// address an http:// page on a public host opens at, as Chrome upgrades it; empty otherwise.
std::string HttpsUpgrade(const std::string& url);
bool PopupAllowed(bool gesture, int open, const std::string& url);
// A link the person opened for a new tab (`tab` disposition) on a public page, not an account sign-in page.
bool OpensAsTab(bool gesture, bool tab, const std::string& url);
// Main-frame and frame navigations stay on public pages; a popup may start blank and a frame may
// hold its own document (srcdoc, data, blob).
bool NavigationAllowed(const std::string& url, bool main_frame);
