#pragma once
// The engine's only link to the Electron host: length-prefixed UTF-8 JSON messages over the
// process's original stdin (host → engine) and stdout (engine → host). See ../README.md#protocol.
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include "include/cef_values.h"

class Channel {
 public:
  using Handler = std::function<void(CefRefPtr<CefDictionaryValue>)>;
  // Takes over stdin/stdout for messages, then points the process's own stdio (inherited by every
  // Chromium child) at stderr and the null device, so no log line can corrupt a message.
  bool Open();
  // Reads on its own thread; `handler` runs there. `closed` runs once when the host goes away.
  void Start(Handler handler, std::function<void()> closed);
  void Send(CefRefPtr<CefDictionaryValue> message);

 private:
  bool ReadExact(void* buffer, size_t size);
  bool WriteExact(const void* buffer, size_t size);
  intptr_t in_ = -1;
  intptr_t out_ = -1;
  std::mutex write_;
  std::thread reader_;
};

// Small helpers for building and reading messages.
CefRefPtr<CefDictionaryValue> Message(const char* type);
std::string Text(CefRefPtr<CefDictionaryValue> message, const char* key);
int Int(CefRefPtr<CefDictionaryValue> message, const char* key, int fallback = 0);
double Number(CefRefPtr<CefDictionaryValue> message, const char* key, double fallback = 0);
bool Flag(CefRefPtr<CefDictionaryValue> message, const char* key);
