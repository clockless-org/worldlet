#include "engine.h"

#include <filesystem>
#include <utility>
#include "include/base/cef_callback.h"
#include "include/cef_command_line.h"
#include "include/cef_version.h"
#include "include/wrapper/cef_closure_task.h"
#include "cookies.h"
#include "page.h"
#include "policy.h"

#if defined(_WIN32)
#include <windows.h>
#endif

namespace {
Engine* g_engine = nullptr;

// Switches that would open the profile to another client; removed whatever added them.
const char* const kBlockedSwitches[] = {"remote-debugging-port", "remote-debugging-pipe", "remote-debugging-address", "remote-debugging-io-pipes",
                                        "remote-debugging-targets", "remote-allow-origins", "user-data-dir", "profile-directory", "disk-cache-dir"};
}  // namespace

Engine::Engine(EngineOptions options) : options_(std::move(options)) { g_engine = this; }

Engine::~Engine() = default;

Engine* Engine::Get() { return g_engine; }

void Engine::OnBeforeCommandLineProcessing(const CefString&, CefRefPtr<CefCommandLine> command) {
  for (const char* name : kBlockedSwitches) command->RemoveSwitch(name);
  // The retired Mac host's switches: website notifications are not a second Attention Center, and
  // one page plays sound at a time (AudioFocusEnforcement, #950).
  command->AppendSwitch("disable-notifications");
  command->AppendSwitch("disable-backgrounding-occluded-windows");
  std::string features = command->GetSwitchValue("enable-features").ToString();
  command->AppendSwitchWithValue("enable-features", features + (features.empty() ? "" : ",") + "AudioFocusEnforcement");
  // Disposable development profiles keep their cookies under a throwaway key, not the keychain.
  if (options_.mock_keychain) command->AppendSwitch("use-mock-keychain");
  // Development checks: a fake camera and microphone, so a call's media path runs without devices or an OS prompt.
  if (options_.fake_media) command->AppendSwitch("use-fake-device-for-media-stream");
}

void Engine::OnContextInitialized() {
  frames_ = FrameSink::Create(&channel_, options_.rendezvous, options_.host_pid);
  CefRefPtr<CefDictionaryValue> ready = Message("ready");
  ready->SetString("cef", CEF_VERSION);
  ready->SetString("chromium", std::to_string(CHROME_VERSION_MAJOR) + "." + std::to_string(CHROME_VERSION_MINOR) + "." + std::to_string(CHROME_VERSION_BUILD) + "." +
                                   std::to_string(CHROME_VERSION_PATCH));
  channel_.Send(ready);
}

CefRefPtr<CefRequestContext> Engine::Context(const std::string& scope) {
  const std::string name = scope == "practice" ? "Practice" : "Website";
  auto found = contexts_.find(name);
  if (found != contexts_.end()) return found->second;
  CefRequestContextSettings settings;
  CefString(&settings.cache_path) = options_.cache + "/" + name;
  settings.persist_session_cookies = true;
  CefRefPtr<CefRequestContext> context = CefRequestContext::CreateContext(settings, nullptr);
  contexts_[name] = context;
  return context;
}

void Engine::Adopt(CefRefPtr<Page> page) { pages_[page->id()] = page; }

void Engine::Created(Page* page) {
  CefRefPtr<CefDictionaryValue> message = Message("created");
  message->SetInt("id", page->id());
  channel_.Send(message);
}

void Engine::Closed(Page* page) {
  const int id = page->id();
  CefRefPtr<CefDictionaryValue> message = Message("closed");
  message->SetInt("id", id);
  channel_.Send(message);
  pages_.erase(id);
  if (quitting_ && pages_.empty()) CefQuitMessageLoop();
}

Page* Engine::Find(int id) {
  auto found = pages_.find(id);
  return found == pages_.end() ? nullptr : found->second.get();
}

int Engine::OpenPopups(int group) {
  int open = 0;
  for (const auto& entry : pages_)
    if (entry.second->group() == group && entry.first != group) ++open;
  return open;
}

void Engine::Ask(int id, const char* kind, CefRefPtr<CefDictionaryValue> details, std::function<void(CefRefPtr<CefDictionaryValue>)> answer) {
  const int question = next_question_++;
  questions_[question] = std::move(answer);
  CefRefPtr<CefDictionaryValue> message = Message("ask");
  message->SetInt("q", question);
  message->SetInt("id", id);
  message->SetString("kind", kind);
  message->SetDictionary("d", details);
  channel_.Send(message);
}

void Engine::Dispatch(CefRefPtr<CefDictionaryValue> message) {
  const std::string type = Text(message, "t");
  if (type == "create") {
    const int id = Int(message, "id");
    if (id <= 0 || id >= kPopupIds || Find(id)) return;
    Page::Open(id, Text(message, "scope"), Text(message, "url"), ReadGeometry(message, Geometry()), Flag(message, "hidden"), Flag(message, "tabs"));
  } else if (type == "answer") {
    auto found = questions_.find(Int(message, "q"));
    if (found == questions_.end()) return;
    auto answer = std::move(found->second);
    questions_.erase(found);
    answer(message);
  } else if (type == "ack") {
    const int id = Int(message, "id"), kind = Int(message, "k");
    if (frames_ && frames_->Acknowledge(id, kind, Int(message, "s")))
      if (Page* page = Find(id)) page->Repaint(kind);
  } else if (type == "policy") {
    Policy(message);
  } else if (type == "cookies") {
    ListCookies(message);
  } else if (type == "set-cookies") {
    SetCookies(message);
  } else if (type == "quit") {
    Quit();
  } else if (Page* page = Find(Int(message, "id"))) {
    page->Apply(message);
  }
}

// Replays rule fixtures for the host's parity check: public pages, http:// upgrades, popups and new tabs.
void Engine::Policy(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<CefDictionaryValue> reply = Message("policy");
  reply->SetInt("q", Int(message, "q"));
  CefRefPtr<CefListValue> pages = CefListValue::Create(), upgrades = CefListValue::Create(), popups = CefListValue::Create(),
                          tabs = CefListValue::Create();
  if (message->GetType("urls") == VTYPE_LIST) {
    CefRefPtr<CefListValue> urls = message->GetList("urls");
    for (size_t i = 0; i < urls->GetSize(); ++i) pages->SetBool(i, PublicPage(urls->GetString(i).ToString()));
  }
  if (message->GetType("upgrades") == VTYPE_LIST) {
    CefRefPtr<CefListValue> urls = message->GetList("upgrades");
    for (size_t i = 0; i < urls->GetSize(); ++i) upgrades->SetString(i, HttpsUpgrade(urls->GetString(i).ToString()));
  }
  if (message->GetType("popups") == VTYPE_LIST) {
    CefRefPtr<CefListValue> cases = message->GetList("popups");
    for (size_t i = 0; i < cases->GetSize(); ++i) {
      CefRefPtr<CefDictionaryValue> entry = cases->GetDictionary(i);
      popups->SetBool(i, entry && PopupAllowed(Flag(entry, "gesture"), Int(entry, "open"), Text(entry, "url")));
    }
  }
  if (message->GetType("tabs") == VTYPE_LIST) {
    CefRefPtr<CefListValue> cases = message->GetList("tabs");
    for (size_t i = 0; i < cases->GetSize(); ++i) {
      CefRefPtr<CefDictionaryValue> entry = cases->GetDictionary(i);
      tabs->SetBool(i, entry && OpensAsTab(Flag(entry, "gesture"), Flag(entry, "tab"), Text(entry, "url")));
    }
  }
  reply->SetList("public", pages);
  reply->SetList("tab", tabs);
  reply->SetList("upgrade", upgrades);
  reply->SetList("popup", popups);
  channel_.Send(reply);
}

void Engine::Quit() {
  if (quitting_) return;
  quitting_ = true;
  if (pages_.empty()) {
    CefQuitMessageLoop();
    return;
  }
  std::map<int, CefRefPtr<Page>> pages = pages_;
  for (auto& entry : pages) entry.second->Close();
}

void Engine::HostGone() { CefPostTask(TID_UI, base::BindOnce(&Engine::Quit, this)); }

int RunEngine(int argc, char** argv, const CefMainArgs& args, void* sandbox_info, EngineOptions paths) {
  CefRefPtr<CefCommandLine> command = CefCommandLine::CreateCommandLine();
#if defined(_WIN32)
  command->InitFromString(::GetCommandLineW());
#else
  command->InitFromArgv(argc, argv);
#endif
  EngineOptions options = std::move(paths);
  options.cache = command->GetSwitchValue("worldlet-cache").ToString();
  options.rendezvous = command->GetSwitchValue("worldlet-rendezvous").ToString();
  options.host_pid = std::stoll("0" + command->GetSwitchValue("worldlet-host").ToString());
  options.mock_keychain = command->HasSwitch("worldlet-mock-keychain");
  options.no_sandbox = command->HasSwitch("worldlet-no-sandbox");
  options.fake_media = command->HasSwitch("worldlet-fake-media");
  if (options.cache.empty()) return 2;
  // CEF compares profile paths after resolving links (/var is /private/var on macOS).
  std::error_code error;
  std::filesystem::create_directories(options.cache, error);
  const std::filesystem::path canonical = std::filesystem::weakly_canonical(options.cache, error);
  if (!error) options.cache = canonical.string();

  CefRefPtr<Engine> engine = new Engine(options);
  if (!engine->channel().Open()) return 2;

  CefSettings settings;
  CefString(&settings.root_cache_path) = options.cache;
  if (!options.subprocess.empty()) CefString(&settings.browser_subprocess_path) = options.subprocess;
  // Chromium otherwise takes the outermost app bundle (Worldlet.app) for its own and looks for its
  // framework and resources there.
  if (!options.bundle.empty()) CefString(&settings.main_bundle_path) = options.bundle;
  if (!options.framework.empty()) CefString(&settings.framework_dir_path) = options.framework;
  settings.persist_session_cookies = true;
  // Chromium's sandbox stays on unless the host runs without one too (Linux, see ../README.md, Toolchains).
  settings.no_sandbox = options.no_sandbox;
  settings.windowless_rendering_enabled = true;
  settings.log_severity = LOGSEVERITY_WARNING;
  settings.background_color = CefColorSetARGB(255, 255, 255, 255);
  if (!CefInitialize(args, settings, engine, sandbox_info)) return 3;
  engine->channel().Start([engine](CefRefPtr<CefDictionaryValue> message) { CefPostTask(TID_UI, base::BindOnce(&Engine::Dispatch, engine, message)); },
                          [engine] { engine->HostGone(); });
  CefRunMessageLoop();
  CefShutdown();
  return 0;
}
