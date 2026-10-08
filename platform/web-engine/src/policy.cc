#include "policy.h"

#include <algorithm>
#include <cctype>
#include <vector>
#include "include/cef_parser.h"

namespace {
bool EndsWith(const std::string& value, const std::string& suffix) {
  return value.size() >= suffix.size() && value.compare(value.size() - suffix.size(), suffix.size(), suffix) == 0;
}

std::vector<std::string> Labels(const std::string& host) {
  std::vector<std::string> labels;
  size_t start = 0;
  for (;;) {
    const size_t dot = host.find('.', start);
    labels.push_back(host.substr(start, dot == std::string::npos ? std::string::npos : dot - start));
    if (dot == std::string::npos) return labels;
    start = dot + 1;
  }
}

bool Digits(const std::string& value, bool hex) {
  return std::all_of(value.begin(), value.end(), [hex](unsigned char c) { return hex ? std::isxdigit(c) : std::isdigit(c); });
}

// The URL as Chromium canonicalizes it, the same parser the page itself uses.
bool Secure(const std::string& url, CefURLParts& parts) {
  if (!CefParseURL(url, parts)) return false;
  return CefString(&parts.scheme).ToString() == "https" && CefString(&parts.username).empty() && CefString(&parts.password).empty();
}

std::string Host(const CefURLParts& parts) {
  std::string host = CefString(&parts.host).ToString();
  std::transform(host.begin(), host.end(), host.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return host;
}
}  // namespace

bool PublicPage(const std::string& url) {
  CefURLParts parts;
  if (!Secure(url, parts)) return false;
  const std::string port = CefString(&parts.port).ToString();
  if (!port.empty() && port != "443") return false;
  std::string host = Host(parts);
  if (EndsWith(host, ".")) host.pop_back();
  const std::vector<std::string> labels = Labels(host);
  if (labels.size() < 2 || std::find(labels.begin(), labels.end(), "") != labels.end() || host.find(':') != std::string::npos) return false;
  for (const char* suffix : {".localhost", ".local", ".invalid"})
    if (EndsWith(host, suffix)) return false;
  // A numeric last label (decimal, octal or 0x hex) makes the whole host an IPv4 address.
  const std::string& last = labels.back();
  if (Digits(last, false)) return false;
  return !(last.rfind("0x", 0) == 0 && Digits(last.substr(2), true));
}

bool SignInPage(const std::string& url) {
  CefURLParts parts;
  if (!Secure(url, parts)) return false;
  const std::string host = Host(parts);
  return host == "accounts.google.com" || host == "appleid.apple.com";
}

std::string HttpsUpgrade(const std::string& url) {
  CefURLParts parts;
  if (!CefParseURL(url, parts) || CefString(&parts.scheme).ToString() != "http") return "";
  // The canonical URL has already dropped the default port 80; any other port stays refused.
  if (!CefString(&parts.username).empty() || !CefString(&parts.password).empty() || !CefString(&parts.port).empty()) return "";
  const std::string spec = CefString(&parts.spec).ToString();
  if (spec.rfind("http://", 0) != 0) return "";
  const std::string upgraded = "https://" + spec.substr(7);
  return PublicPage(upgraded) ? upgraded : "";
}

bool PopupAllowed(bool gesture, int open, const std::string& url) {
  return gesture && open < kMaxPopups && (url.empty() || url == "about:blank" || PublicPage(url) || !HttpsUpgrade(url).empty());
}

bool OpensAsTab(bool gesture, bool tab, const std::string& url) {
  return gesture && tab && !SignInPage(url) && (PublicPage(url) || !HttpsUpgrade(url).empty());
}

bool NavigationAllowed(const std::string& url, bool main_frame) {
  if (PublicPage(url) || url == "about:blank") return true;
  if (main_frame) return false;
  return url.rfind("about:srcdoc", 0) == 0 || url.rfind("data:", 0) == 0 || url.rfind("blob:", 0) == 0;
}
