#include "channel.h"

#include <cstdint>
#include <cstdio>
#include "include/cef_parser.h"

#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace {
// A message larger than this is a protocol error, not data (frames travel as GPU handles).
constexpr uint32_t kMaxMessage = 64 * 1024 * 1024;
}  // namespace

bool Channel::Open() {
#if defined(_WIN32)
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE), output = GetStdHandle(STD_OUTPUT_HANDLE);
  HANDLE process = GetCurrentProcess(), in = nullptr, out = nullptr;
  if (input == INVALID_HANDLE_VALUE || output == INVALID_HANDLE_VALUE || !input || !output) return false;
  if (!DuplicateHandle(process, input, process, &in, 0, FALSE, DUPLICATE_SAME_ACCESS)) return false;
  if (!DuplicateHandle(process, output, process, &out, 0, FALSE, DUPLICATE_SAME_ACCESS)) return false;
  in_ = reinterpret_cast<intptr_t>(in);
  out_ = reinterpret_cast<intptr_t>(out);
  HANDLE null = CreateFileW(L"NUL", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
  SetStdHandle(STD_INPUT_HANDLE, null);
  SetStdHandle(STD_OUTPUT_HANDLE, GetStdHandle(STD_ERROR_HANDLE));
  _dup2(_fileno(stderr), 1);
  int nul = _open("NUL", _O_RDONLY);
  if (nul >= 0) _dup2(nul, 0);
#else
  const int in = dup(STDIN_FILENO), out = dup(STDOUT_FILENO);
  if (in < 0 || out < 0) return false;
  fcntl(in, F_SETFD, FD_CLOEXEC);
  fcntl(out, F_SETFD, FD_CLOEXEC);
  in_ = in;
  out_ = out;
  const int null = open("/dev/null", O_RDONLY);
  if (null >= 0) {
    dup2(null, STDIN_FILENO);
    close(null);
  }
  dup2(STDERR_FILENO, STDOUT_FILENO);
#endif
  return true;
}

bool Channel::ReadExact(void* buffer, size_t size) {
  auto* bytes = static_cast<uint8_t*>(buffer);
  while (size) {
#if defined(_WIN32)
    DWORD read = 0;
    if (!ReadFile(reinterpret_cast<HANDLE>(in_), bytes, static_cast<DWORD>(size), &read, nullptr) || !read) return false;
#else
    const ssize_t read = ::read(static_cast<int>(in_), bytes, size);
    if (read <= 0) return false;
#endif
    bytes += read;
    size -= static_cast<size_t>(read);
  }
  return true;
}

bool Channel::WriteExact(const void* buffer, size_t size) {
  const auto* bytes = static_cast<const uint8_t*>(buffer);
  while (size) {
#if defined(_WIN32)
    DWORD written = 0;
    if (!WriteFile(reinterpret_cast<HANDLE>(out_), bytes, static_cast<DWORD>(size), &written, nullptr) || !written) return false;
#else
    const ssize_t written = ::write(static_cast<int>(out_), bytes, size);
    if (written <= 0) return false;
#endif
    bytes += written;
    size -= static_cast<size_t>(written);
  }
  return true;
}

void Channel::Start(Handler handler, std::function<void()> closed) {
  reader_ = std::thread([this, handler, closed] {
    std::string body;
    for (;;) {
      uint8_t header[4];
      if (!ReadExact(header, sizeof header)) break;
      const uint32_t size = header[0] | header[1] << 8 | header[2] << 16 | static_cast<uint32_t>(header[3]) << 24;
      if (!size || size > kMaxMessage) break;
      body.resize(size);
      if (!ReadExact(body.data(), size)) break;
      CefRefPtr<CefValue> value = CefParseJSON(body.data(), body.size(), JSON_PARSER_RFC);
      if (value && value->GetType() == VTYPE_DICTIONARY) handler(value->GetDictionary());
    }
    closed();
  });
  reader_.detach();
}

void Channel::Send(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<CefValue> value = CefValue::Create();
  value->SetDictionary(message);
  const std::string json = CefWriteJSON(value, JSON_WRITER_DEFAULT).ToString();
  const uint32_t size = static_cast<uint32_t>(json.size());
  const uint8_t header[4] = {static_cast<uint8_t>(size), static_cast<uint8_t>(size >> 8), static_cast<uint8_t>(size >> 16), static_cast<uint8_t>(size >> 24)};
  std::lock_guard<std::mutex> lock(write_);
  if (!WriteExact(header, sizeof header) || !WriteExact(json.data(), json.size())) {
    // The host is gone; the reader thread sees the same and shuts the engine down.
  }
}

CefRefPtr<CefDictionaryValue> Message(const char* type) {
  CefRefPtr<CefDictionaryValue> message = CefDictionaryValue::Create();
  message->SetString("t", type);
  return message;
}

std::string Text(CefRefPtr<CefDictionaryValue> message, const char* key) {
  return message->GetType(key) == VTYPE_STRING ? message->GetString(key).ToString() : std::string();
}

int Int(CefRefPtr<CefDictionaryValue> message, const char* key, int fallback) {
  switch (message->GetType(key)) {
    case VTYPE_INT: return message->GetInt(key);
    case VTYPE_DOUBLE: return static_cast<int>(message->GetDouble(key));
    default: return fallback;
  }
}

double Number(CefRefPtr<CefDictionaryValue> message, const char* key, double fallback) {
  switch (message->GetType(key)) {
    case VTYPE_INT: return message->GetInt(key);
    case VTYPE_DOUBLE: return message->GetDouble(key);
    default: return fallback;
  }
}

bool Flag(CefRefPtr<CefDictionaryValue> message, const char* key) {
  return message->GetType(key) == VTYPE_BOOL && message->GetBool(key);
}
