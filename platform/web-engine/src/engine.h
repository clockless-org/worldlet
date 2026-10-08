#pragma once
// The website engine process: CEF with Chrome's own layer, windowless pages, one private channel to
// the Electron host. Product rules stay in the host's shared code; this process executes requests and
// answers only the decisions Chromium needs synchronously (policy.h). See ../README.md.
#include <functional>
#include <map>
#include <memory>
#include <string>
#include "include/cef_app.h"
#include "include/cef_request_context.h"
#include "channel.h"
#include "frames.h"

class Page;

struct EngineOptions {
  std::string cache;       // root of the engine's profiles (<library>/Browser/CEF)
  std::string rendezvous;  // macOS: the host's Mach service for shared surfaces
  int64_t host_pid = 0;    // the Electron main process
  bool mock_keychain = false;
  bool fake_media = false;  // checks only: Chromium's fake camera and microphone stand in for real ones
  bool no_sandbox = false;  // Linux: the host itself runs without Chromium's sandbox (--no-sandbox)
  std::string subprocess;  // macOS: helper executable
  std::string bundle;      // macOS: the engine's own app bundle (it is nested inside Worldlet.app)
  std::string framework;   // macOS: its Chromium Embedded Framework
};

class Engine : public CefApp, public CefBrowserProcessHandler {
 public:
  explicit Engine(EngineOptions options);
  ~Engine() override;
  static Engine* Get();

  // CefApp / CefBrowserProcessHandler
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  void OnBeforeCommandLineProcessing(const CefString& process_type, CefRefPtr<CefCommandLine> command_line) override;
  void OnContextInitialized() override;

  Channel& channel() { return channel_; }
  FrameSink* frames() { return frames_.get(); }
  const EngineOptions& options() const { return options_; }
  // Personal and practice website storage stay separate, as in the Electron partitions.
  CefRefPtr<CefRequestContext> Context(const std::string& scope);

  // Pages, by the id the host gave them (popups get ids from kPopupIds upward).
  static constexpr int kPopupIds = 1 << 30;
  int NextPopupId() { return next_popup_++; }
  void Adopt(CefRefPtr<Page> page);
  void Created(Page* page);
  void Closed(Page* page);
  Page* Find(int id);
  int OpenPopups(int group);

  // A question to the host (dialogs, permissions, downloads, files); the answer arrives later.
  void Ask(int id, const char* kind, CefRefPtr<CefDictionaryValue> details, std::function<void(CefRefPtr<CefDictionaryValue>)> answer);

  void Dispatch(CefRefPtr<CefDictionaryValue> message);  // UI thread
  void HostGone();                                        // any thread

 private:
  void Quit();
  void Policy(CefRefPtr<CefDictionaryValue> message);

  EngineOptions options_;
  Channel channel_;
  std::unique_ptr<FrameSink> frames_;
  std::map<std::string, CefRefPtr<CefRequestContext>> contexts_;
  std::map<int, CefRefPtr<Page>> pages_;
  std::map<int, std::function<void(CefRefPtr<CefDictionaryValue>)>> questions_;
  int next_question_ = 1;
  int next_popup_ = kPopupIds;
  bool quitting_ = false;
  IMPLEMENT_REFCOUNTING(Engine);
};

// Shared process entry once the platform main has loaded CEF (main_mac.mm, main_win.cc, main_linux.cc).
int RunEngine(int argc, char** argv, const CefMainArgs& args, void* sandbox_info, EngineOptions paths);
