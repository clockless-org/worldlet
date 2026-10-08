#pragma once
// The website storage's cookies, for the host to keep the engine and Electron's own views signed in alike
// (owner report 2026-10-08: signing in on one engine did not reach the other). See ../README.md#cookies.
#include "include/cef_values.h"

// `cookies` {q, scope}: every cookie of that world's website storage, answered as `cookies` {q, cookies}.
void ListCookies(CefRefPtr<CefDictionaryValue> message);
// `set-cookies` {scope, set, remove}: cookies to set ({url, name, value, domain, path, secure, httpOnly,
// sameSite, expires}) and to delete ({url, name}).
void SetCookies(CefRefPtr<CefDictionaryValue> message);
