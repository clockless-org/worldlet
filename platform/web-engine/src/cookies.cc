#include "cookies.h"

#include "channel.h"
#include "engine.h"
#include "include/cef_cookie.h"

namespace {
// CefBaseTime counts microseconds from 1601; the host speaks Unix seconds.
constexpr int64_t kUnixEpoch = 11644473600LL * 1000000LL;
double UnixSeconds(const CefBaseTime& time) { return static_cast<double>(time.val - kUnixEpoch) / 1000000.0; }
CefBaseTime BaseTime(double seconds) {
  CefBaseTime time;
  time.val = static_cast<int64_t>(seconds * 1000000.0) + kUnixEpoch;
  return time;
}
const char* SameSite(cef_cookie_same_site_t value) {
  switch (value) {
    case CEF_COOKIE_SAME_SITE_NO_RESTRICTION: return "no_restriction";
    case CEF_COOKIE_SAME_SITE_LAX_MODE: return "lax";
    case CEF_COOKIE_SAME_SITE_STRICT_MODE: return "strict";
    default: return "unspecified";
  }
}
cef_cookie_same_site_t SameSite(const std::string& value) {
  if (value == "no_restriction") return CEF_COOKIE_SAME_SITE_NO_RESTRICTION;
  if (value == "lax") return CEF_COOKIE_SAME_SITE_LAX_MODE;
  if (value == "strict") return CEF_COOKIE_SAME_SITE_STRICT_MODE;
  return CEF_COOKIE_SAME_SITE_UNSPECIFIED;
}

// Collects every cookie; CEF releases the visitor after the last one (at once when there are none or the
// storage cannot be read), and the answer goes then.
class Collector : public CefCookieVisitor {
 public:
  explicit Collector(int q) : q_(q), cookies_(CefListValue::Create()) {}
  ~Collector() override {
    CefRefPtr<CefDictionaryValue> reply = Message("cookies");
    reply->SetInt("q", q_);
    reply->SetList("cookies", cookies_);
    Engine::Get()->channel().Send(reply);
  }
  bool Visit(const CefCookie& cookie, int, int, bool&) override {
    CefRefPtr<CefDictionaryValue> entry = CefDictionaryValue::Create();
    entry->SetString("name", CefString(&cookie.name));
    entry->SetString("value", CefString(&cookie.value));
    entry->SetString("domain", CefString(&cookie.domain));
    entry->SetString("path", CefString(&cookie.path));
    entry->SetBool("secure", cookie.secure);
    entry->SetBool("httpOnly", cookie.httponly);
    entry->SetString("sameSite", SameSite(cookie.same_site));
    entry->SetDouble("expires", cookie.has_expires ? UnixSeconds(cookie.expires) : 0);
    cookies_->SetDictionary(cookies_->GetSize(), entry);
    return true;
  }

 private:
  const int q_;
  CefRefPtr<CefListValue> cookies_;
  IMPLEMENT_REFCOUNTING(Collector);
};

CefRefPtr<CefCookieManager> Manager(CefRefPtr<CefDictionaryValue> message) {
  return Engine::Get()->Context(Text(message, "scope"))->GetCookieManager(nullptr);
}
}  // namespace

void ListCookies(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<Collector> collector = new Collector(Int(message, "q"));
  CefRefPtr<CefCookieManager> manager = Manager(message);
  if (manager) manager->VisitAllCookies(collector);
}

void SetCookies(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<CefCookieManager> manager = Manager(message);
  if (!manager) return;
  if (message->GetType("set") == VTYPE_LIST) {
    CefRefPtr<CefListValue> list = message->GetList("set");
    for (size_t i = 0; i < list->GetSize(); ++i) {
      CefRefPtr<CefDictionaryValue> entry = list->GetDictionary(i);
      if (!entry) continue;
      CefCookie cookie;
      CefString(&cookie.name) = Text(entry, "name");
      CefString(&cookie.value) = Text(entry, "value");
      // An empty domain makes a host cookie; a domain cookie keeps its leading dot.
      CefString(&cookie.domain) = Text(entry, "domain");
      CefString(&cookie.path) = Text(entry, "path");
      cookie.secure = Flag(entry, "secure");
      cookie.httponly = Flag(entry, "httpOnly");
      cookie.same_site = SameSite(Text(entry, "sameSite"));
      const double expires = Number(entry, "expires");
      cookie.has_expires = expires > 0;
      if (cookie.has_expires) cookie.expires = BaseTime(expires);
      manager->SetCookie(Text(entry, "url"), cookie, nullptr);
    }
  }
  if (message->GetType("remove") == VTYPE_LIST) {
    CefRefPtr<CefListValue> list = message->GetList("remove");
    for (size_t i = 0; i < list->GetSize(); ++i) {
      CefRefPtr<CefDictionaryValue> entry = list->GetDictionary(i);
      if (entry) manager->DeleteCookies(Text(entry, "url"), Text(entry, "name"), nullptr);
    }
  }
}
