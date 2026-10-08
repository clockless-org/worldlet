#include "page.h"

#include <algorithm>
#include <cstring>
#include "include/base/cef_callback.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_closure_task.h"
#include "engine.h"
#include "policy.h"

namespace {
CefRefPtr<CefDictionaryValue> Event(const char* type, int id) {
  CefRefPtr<CefDictionaryValue> message = Message(type);
  message->SetInt("id", id);
  return message;
}

CefRefPtr<CefListValue> RectValue(const CefRect& rect) {
  CefRefPtr<CefListValue> list = CefListValue::Create();
  list->SetInt(0, rect.x);
  list->SetInt(1, rect.y);
  list->SetInt(2, rect.width);
  list->SetInt(3, rect.height);
  return list;
}

CefRect RectFrom(CefRefPtr<CefDictionaryValue> message, const char* key, const CefRect& fallback) {
  if (message->GetType(key) != VTYPE_LIST) return fallback;
  CefRefPtr<CefListValue> list = message->GetList(key);
  if (list->GetSize() != 4) return fallback;
  auto at = [&](size_t i) { return list->GetType(i) == VTYPE_INT ? list->GetInt(i) : static_cast<int>(list->GetDouble(i)); };
  return CefRect(at(0), at(1), at(2), at(3));
}

CefWindowInfo Windowless() {
  CefWindowInfo info;
  info.SetAsWindowless(kNullWindowHandle);
  // GPU textures where the frame sink takes them; CEF's pixels otherwise (Linux, frames_linux.cc).
  FrameSink* frames = Engine::Get()->frames();
  info.shared_texture_enabled = !frames || frames->textures();
  // BeginFrames come from the page's own clock (Page::Tick). Chromium's display-driven frames do
  // not keep a lower windowless frame rate on macOS once input arrives.
  info.external_begin_frame_enabled = true;
  info.runtime_style = CEF_RUNTIME_STYLE_ALLOY;
  return info;
}

void Prepare(CefBrowserSettings& settings) {
  settings.windowless_frame_rate = 60;
  settings.background_color = CefColorSetARGB(255, 255, 255, 255);
}

void LoadInFrame(CefRefPtr<CefFrame> frame, const std::string& url) {
  if (frame->IsValid()) frame->LoadURL(url);
}

// A link the person followed that the rules kept from opening: the host is told where it led (scheme and host,
// never the path) and why, so a click that "does nothing" leaves a trace (owner report 2026-10-06).
void Refused(int id, const char* kind, const char* reason, const std::string& url) {
  CefRefPtr<CefDictionaryValue> message = Event("refused", id);
  message->SetString("kind", kind);
  message->SetString("reason", reason);
  CefURLParts parts;
  if (CefParseURL(url, parts)) {
    message->SetString("scheme", CefString(&parts.scheme).ToString().substr(0, 32));
    message->SetString("host", CefString(&parts.host).ToString().substr(0, 253));
  } else {
    message->SetString("scheme", url.substr(0, std::min<size_t>(url.find(':'), 32)));
  }
  Engine::Get()->channel().Send(message);
}

// Domains the host or Fox's driver may have enabled; a sign-in page runs with none of them.
const char* const kObservingDomains[] = {"Runtime", "Page", "DOM", "CSS", "Network", "Log", "Fetch", "Overlay", "Accessibility", "DOMSnapshot"};
}  // namespace

Geometry ReadGeometry(CefRefPtr<CefDictionaryValue> message, Geometry base) {
  base.width = std::max(1, Int(message, "w", base.width));
  base.height = std::max(1, Int(message, "h", base.height));
  const float scale = static_cast<float>(Number(message, "scale", base.scale));
  base.scale = scale > 0 ? scale : 1;
  base.view = RectFrom(message, "view", base.view);
  base.window = RectFrom(message, "window", base.window);
  base.screen = RectFrom(message, "screen", base.screen);
  base.available = RectFrom(message, "available", base.available);
  return base;
}

Page::Page(int id, int opener, int group, std::string scope, Geometry geometry)
    : id_(id), opener_(opener), group_(group), scope_(std::move(scope)), geometry_(geometry) {}

void Page::Open(int id, const std::string& scope, const std::string& url, Geometry geometry, bool hidden, bool tabs) {
  CefRefPtr<Page> page = new Page(id, 0, id, scope, geometry);
  page->hidden_ = hidden;
  page->tabs_ = tabs;
  Engine::Get()->Adopt(page);
  CefBrowserSettings settings;
  Prepare(settings);
  // The host checked the address too; anything else starts blank.
  const std::string start = NavigationAllowed(url, true) ? url : "about:blank";
  if (!CefBrowserHost::CreateBrowser(Windowless(), page, start, settings, nullptr, Engine::Get()->Context(scope))) Engine::Get()->Closed(page.get());
}

void Page::Send(CefRefPtr<CefDictionaryValue> message) { Engine::Get()->channel().Send(message); }

void Page::Close() {
  closing_ = true;
  if (browser_) browser_->GetHost()->CloseBrowser(true);
}

void Page::Repaint(int kind) {
  if (browser_) browser_->GetHost()->Invalidate(kind ? PET_POPUP : PET_VIEW);
}

void Page::Apply(CefRefPtr<CefDictionaryValue> message) {
  const std::string type = Text(message, "t");
  if (type == "close") {
    Close();
    return;
  }
  if (!browser_) return;
  CefRefPtr<CefBrowserHost> host = browser_->GetHost();
  if (type == "resize") {
    const Geometry next = ReadGeometry(message, geometry_);
    const bool rescaled = next.scale != geometry_.scale;
    geometry_ = next;
    if (rescaled) host->NotifyScreenInfoChanged();
    host->WasResized();
  } else if (type == "repaint") {
    Repaint(Int(message, "k"));
  } else if (type == "show") {
    hidden_ = Flag(message, "hidden");
    host->WasHidden(hidden_);
    Clock();
  } else if (type == "focus") {
    focused_ = Flag(message, "focus");
    host->SetFocus(focused_);
  } else if (type == "load") {
    const std::string url = Text(message, "url");
    if (NavigationAllowed(url, true)) browser_->GetMainFrame()->LoadURL(url);
  } else if (type == "nav") {
    const std::string op = Text(message, "op");
    if (op == "back") browser_->GoBack();
    else if (op == "forward") browser_->GoForward();
    else if (op == "reload") browser_->Reload();
    else if (op == "stop") browser_->StopLoad();
  } else if (type == "mute") {
    host->SetAudioMuted(Flag(message, "muted"));
  } else if (type == "fps") {
    fps_ = std::clamp(Int(message, "fps", 60), 1, 120);
    host->SetWindowlessFrameRate(fps_);
    Clock();
  } else if (type == "mouse") {
    Mouse(message);
  } else if (type == "key") {
    Key(message);
  } else if (type == "ime") {
    Ime(message);
  } else if (type == "edit") {
    Edit(Text(message, "op"));
  } else if (type == "devtools") {
    const std::string body = Text(message, "m");
    if (shielded_) {
      // A sign-in page answers no inspection; the request still gets its reply.
      CefRefPtr<CefValue> parsed = CefParseJSON(body, JSON_PARSER_RFC);
      if (parsed && parsed->GetType() == VTYPE_DICTIONARY && parsed->GetDictionary()->GetType("id") == VTYPE_INT) {
        CefRefPtr<CefDictionaryValue> reply = Event("devtools", id_);
        reply->SetString("m", "{\"id\":" + std::to_string(parsed->GetDictionary()->GetInt("id")) +
                                  ",\"error\":{\"code\":-32000,\"message\":\"The page is an account sign-in page.\"}}");
        Send(reply);
      }
      return;
    }
    host->SendDevToolsMessage(body.data(), body.size());
  }
}

void Page::Mouse(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<CefBrowserHost> host = browser_->GetHost();
  CefMouseEvent event;
  event.x = Int(message, "x");
  event.y = Int(message, "y");
  event.modifiers = static_cast<uint32_t>(Int(message, "m"));
  const std::string kind = Text(message, "e");
  if (kind == "move" || kind == "leave") {
    host->SendMouseMoveEvent(event, kind == "leave");
  } else if (kind == "down" || kind == "up") {
    const int button = Int(message, "b");
    const cef_mouse_button_type_t type = button == 2 ? MBT_RIGHT : button == 1 ? MBT_MIDDLE : MBT_LEFT;
    host->SendMouseClickEvent(event, type, kind == "up", std::max(1, Int(message, "n", 1)));
  } else if (kind == "wheel") {
    host->SendMouseWheelEvent(event, Int(message, "dx"), Int(message, "dy"));
  }
}

void Page::Key(CefRefPtr<CefDictionaryValue> message) {
  CefKeyEvent event;
  const std::string kind = Text(message, "e");
  event.type = kind == "down" ? KEYEVENT_RAWKEYDOWN : kind == "up" ? KEYEVENT_KEYUP : KEYEVENT_CHAR;
  event.windows_key_code = Int(message, "vk");
  event.native_key_code = Int(message, "native");
  event.modifiers = static_cast<uint32_t>(Int(message, "m"));
  event.is_system_key = Flag(message, "sys");
  event.character = static_cast<char16_t>(Int(message, "ch"));
  event.unmodified_character = static_cast<char16_t>(Int(message, "uch"));
  browser_->GetHost()->SendKeyEvent(event);
}

void Page::Ime(CefRefPtr<CefDictionaryValue> message) {
  CefRefPtr<CefBrowserHost> host = browser_->GetHost();
  const std::string kind = Text(message, "e");
  const CefString text(Text(message, "text"));
  if (kind == "set") {
    CefCompositionUnderline underline;
    underline.range = CefRange(0, static_cast<uint32_t>(text.length()));
    underline.color = CefColorSetARGB(255, 0, 0, 0);
    underline.background_color = CefColorSetARGB(0, 0, 0, 0);
    underline.thick = 0;
    underline.style = CEF_CUS_SOLID;
    const uint32_t from = static_cast<uint32_t>(std::max(0, Int(message, "s0", static_cast<int>(text.length()))));
    const uint32_t to = static_cast<uint32_t>(std::max(0, Int(message, "s1", static_cast<int>(text.length()))));
    host->ImeSetComposition(text, {underline}, CefRange::InvalidRange(), CefRange(from, to));
  } else if (kind == "commit") {
    host->ImeCommitText(text, CefRange::InvalidRange(), 0);
  } else if (kind == "finish") {
    host->ImeFinishComposingText(false);
  } else if (kind == "cancel") {
    host->ImeCancelComposition();
  }
}

void Page::Edit(const std::string& command) {
  CefRefPtr<CefFrame> frame = browser_->GetFocusedFrame();
  if (!frame) frame = browser_->GetMainFrame();
  if (command == "copy") frame->Copy();
  else if (command == "cut") frame->Cut();
  else if (command == "paste") frame->Paste();
  else if (command == "selectAll") frame->SelectAll();
  else if (command == "undo") frame->Undo();
  else if (command == "redo") frame->Redo();
  else if (command == "delete") frame->Delete();
}

void Page::Shield(bool on) {
  if (on == shielded_) return;
  shielded_ = on;
  if (on && browser_) {
    int sequence = -1;
    for (const char* domain : kObservingDomains) {
      const std::string request = "{\"id\":" + std::to_string(sequence--) + ",\"method\":\"" + domain + ".disable\"}";
      browser_->GetHost()->SendDevToolsMessage(request.data(), request.size());
    }
  }
  CefRefPtr<CefDictionaryValue> message = Event("shield", id_);
  message->SetBool("on", on);
  Send(message);
}

// Render handler ---------------------------------------------------------------------------------

bool Page::GetRootScreenRect(CefRefPtr<CefBrowser>, CefRect& rect) {
  rect = geometry_.window.width > 0 ? geometry_.window : geometry_.view;
  return rect.width > 0 && rect.height > 0;
}

void Page::GetViewRect(CefRefPtr<CefBrowser>, CefRect& rect) { rect = CefRect(0, 0, std::max(1, geometry_.width), std::max(1, geometry_.height)); }

bool Page::GetScreenPoint(CefRefPtr<CefBrowser>, int viewX, int viewY, int& screenX, int& screenY) {
  screenX = geometry_.view.x + viewX;
  screenY = geometry_.view.y + viewY;
  return true;
}

bool Page::GetScreenInfo(CefRefPtr<CefBrowser>, CefScreenInfo& screen_info) {
  screen_info.device_scale_factor = geometry_.scale;
  screen_info.depth = 24;
  screen_info.depth_per_component = 8;
  screen_info.is_monochrome = 0;
  screen_info.rect = geometry_.screen.width > 0 ? geometry_.screen : geometry_.view;
  screen_info.available_rect = geometry_.available.width > 0 ? geometry_.available : screen_info.rect;
  return true;
}

void Page::OnPopupShow(CefRefPtr<CefBrowser>, bool show) {
  CefRefPtr<CefDictionaryValue> message = Event("widget", id_);
  message->SetBool("show", show);
  Send(message);
}

void Page::OnPopupSize(CefRefPtr<CefBrowser>, const CefRect& rect) {
  CefRefPtr<CefDictionaryValue> message = Event("widget", id_);
  message->SetBool("show", true);
  message->SetList("rect", RectValue(rect));
  Send(message);
}

void Page::OnPaint(CefRefPtr<CefBrowser>, PaintElementType type, const RectList&, const void* buffer, int width, int height) {
  if (FrameSink* frames = Engine::Get()->frames()) frames->Paint(id_, type == PET_POPUP ? 1 : 0, buffer, width, height);
}

void Page::OnAcceleratedPaint(CefRefPtr<CefBrowser>, PaintElementType type, const RectList&, const CefAcceleratedPaintInfo& info) {
  if (FrameSink* frames = Engine::Get()->frames()) frames->Publish(id_, type == PET_POPUP ? 1 : 0, info);
}

void Page::OnImeCompositionRangeChanged(CefRefPtr<CefBrowser>, const CefRange& selected_range, const RectList& character_bounds) {
  CefRefPtr<CefDictionaryValue> message = Event("ime", id_);
  CefRefPtr<CefListValue> range = CefListValue::Create();
  range->SetInt(0, static_cast<int>(selected_range.from));
  range->SetInt(1, static_cast<int>(selected_range.to));
  message->SetList("range", range);
  CefRefPtr<CefListValue> bounds = CefListValue::Create();
  for (size_t i = 0; i < character_bounds.size() && i < 256; ++i) bounds->SetList(i, RectValue(character_bounds[i]));
  message->SetList("bounds", bounds);
  Send(message);
}

// Life span --------------------------------------------------------------------------------------

bool Page::OnBeforePopup(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>, int popup_id, const CefString& target_url, const CefString&, cef_window_open_disposition_t disposition,
                         bool user_gesture, const CefPopupFeatures&, CefWindowInfo& windowInfo, CefRefPtr<CefClient>& client,
                         CefBrowserSettings& settings, CefRefPtr<CefDictionaryValue>&, bool*) {
  Engine* engine = Engine::Get();
  const std::string url = target_url.ToString();
  if (closing_) return true;
  // In a Browser tab, a link for a new tab (target=_blank, a middle or ⌘-click) opens the Browser's next tab
  // (owner request 2026-10-08); a window the page sizes itself (a sign-in popup) still stacks over its opener.
  const bool tab = disposition == CEF_WOD_NEW_FOREGROUND_TAB || disposition == CEF_WOD_NEW_BACKGROUND_TAB;
  if (tabs_ && OpensAsTab(user_gesture, tab, url)) {
    CefRefPtr<CefDictionaryValue> message = Event("tab", id_);
    const std::string upgraded = HttpsUpgrade(url);
    message->SetString("url", upgraded.empty() ? url : upgraded);
    message->SetBool("background", disposition == CEF_WOD_NEW_BACKGROUND_TAB);
    Send(message);
    return true;
  }
  const int open = engine->OpenPopups(group_);
  if (!PopupAllowed(user_gesture, open, url)) {
    // Pages open windows on their own all the time (ads); only a window the person asked for is reported.
    if (user_gesture) Refused(id_, "popup", open >= kMaxPopups ? "popups" : "address", url);
    return true;
  }
  const int id = engine->NextPopupId();
  // A popup stacks over its opener in the same panel, at the opener's size and profile.
  CefRefPtr<Page> page = new Page(id, id_, group_, scope_, geometry_);
  page->hidden_ = hidden_;
  engine->Adopt(page);
  popups_[popup_id] = id;
  windowInfo = Windowless();
  Prepare(settings);
  client = page;
  CefRefPtr<CefDictionaryValue> message = Event("popup", id);
  message->SetInt("opener", id_);
  message->SetString("url", url);
  Send(message);
  return false;
}

void Page::OnBeforePopupAborted(CefRefPtr<CefBrowser>, int popup_id) {
  auto found = popups_.find(popup_id);
  if (found == popups_.end()) return;
  if (Page* page = Engine::Get()->Find(found->second)) Engine::Get()->Closed(page);
  popups_.erase(found);
}

void Page::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  browser_ = browser;
  for (auto it = popups_.begin(); it != popups_.end();) it = Engine::Get()->Find(it->second) ? std::next(it) : popups_.erase(it);
  devtools_ = browser->GetHost()->AddDevToolsMessageObserver(this);
  if (hidden_) browser->GetHost()->WasHidden(true);
  Clock();
  Engine::Get()->Created(this);
  if (closing_) browser->GetHost()->CloseBrowser(true);
}

void Page::OnBeforeClose(CefRefPtr<CefBrowser>) {
  ++clock_;
  devtools_ = nullptr;
  browser_ = nullptr;
  if (FrameSink* frames = Engine::Get()->frames()) frames->Forget(id_);
  Engine::Get()->Closed(this);
}

// A shown page gets `fps_` BeginFrames a second, on schedule however long each takes; a hidden one
// gets none (CEF does not render it). Restarting the clock ends the previous one at once.
void Page::Clock() {
  next_frame_ = std::chrono::steady_clock::now();
  Tick(++clock_);
}

void Page::Tick(int generation) {
  if (generation != clock_ || !browser_ || hidden_) return;
  browser_->GetHost()->SendExternalBeginFrame();
  const auto now = std::chrono::steady_clock::now();
  next_frame_ = std::max(next_frame_ + std::chrono::microseconds(1000000 / fps_), now);
  const auto delay = std::chrono::duration_cast<std::chrono::milliseconds>(next_frame_ - now).count();
  PostFrameTask(CefCreateClosureTask(base::BindOnce(&Page::Tick, CefRefPtr<Page>(this), generation)), delay);
}

// Loading and display ----------------------------------------------------------------------------

void Page::OnLoadingStateChange(CefRefPtr<CefBrowser>, bool isLoading, bool canGoBack, bool canGoForward) {
  CefRefPtr<CefDictionaryValue> message = Event("loading", id_);
  message->SetBool("loading", isLoading);
  message->SetBool("back", canGoBack);
  message->SetBool("forward", canGoForward);
  Send(message);
}

void Page::OnLoadEnd(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, int httpStatusCode) {
  if (!frame->IsMain()) return;
  CefRefPtr<CefDictionaryValue> message = Event("loaded", id_);
  message->SetInt("status", httpStatusCode);
  message->SetString("url", frame->GetURL());
  Send(message);
}

void Page::OnLoadError(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, ErrorCode errorCode, const CefString&, const CefString& failedUrl) {
  CefRefPtr<CefDictionaryValue> message = Event("failed", id_);
  message->SetInt("code", static_cast<int>(errorCode));
  message->SetString("url", failedUrl);
  message->SetBool("main", frame->IsMain());
  Send(message);
}

void Page::OnAddressChange(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, const CefString& url) {
  if (!frame->IsMain()) return;
  // A cross-site navigation commits in a new renderer that has not been told the panel has focus: without
  // it the page still takes keys but draws no caret and reports document.hasFocus() false.
  if (focused_ && browser_) browser_->GetHost()->SetFocus(true);
  Shield(SignInPage(url.ToString()));
  CefRefPtr<CefDictionaryValue> message = Event("address", id_);
  message->SetString("url", url);
  Send(message);
}

void Page::OnTitleChange(CefRefPtr<CefBrowser>, const CefString& title) {
  CefRefPtr<CefDictionaryValue> message = Event("title", id_);
  message->SetString("title", title);
  Send(message);
}

void Page::OnFullscreenModeChange(CefRefPtr<CefBrowser>, bool fullscreen) {
  CefRefPtr<CefDictionaryValue> message = Event("fullscreen", id_);
  message->SetBool("on", fullscreen);
  Send(message);
}

bool Page::OnTooltip(CefRefPtr<CefBrowser>, CefString& text) {
  CefRefPtr<CefDictionaryValue> message = Event("tooltip", id_);
  message->SetString("text", text);
  Send(message);
  return true;
}

bool Page::OnCursorChange(CefRefPtr<CefBrowser>, CefCursorHandle, cef_cursor_type_t type, const CefCursorInfo&) {
  CefRefPtr<CefDictionaryValue> message = Event("cursor", id_);
  message->SetInt("c", static_cast<int>(type));
  Send(message);
  return true;
}

// Requests ---------------------------------------------------------------------------------------

bool Page::OnBeforeBrowse(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, CefRefPtr<CefRequest> request, bool user_gesture, bool is_redirect) {
  const std::string url = request->GetURL().ToString();
  const bool main = frame->IsMain();
  if (!NavigationAllowed(url, main)) {
    // An http:// page on a public host opens at its https:// address instead, as Chrome upgrades it: a
    // refused navigation left Xiaohongshu's QR sign-in on a white page (it returns to http://, 2026-10-05).
    // A site that sends the https:// address straight back to http:// is upgraded once, not in a loop.
    const std::string upgraded = main ? HttpsUpgrade(url) : std::string();
    const auto now = std::chrono::steady_clock::now();
    if (!upgraded.empty() && !(upgraded == upgraded_ && now - upgraded_at_ < std::chrono::seconds(10))) {
      upgraded_ = upgraded;
      upgraded_at_ = now;
      CefPostTask(TID_UI, base::BindOnce(&LoadInFrame, frame, upgraded));
    } else if (main && upgraded.empty() && (user_gesture || is_redirect)) {
      Refused(id_, "navigation", "address", url);
    }
    return true;
  }
  if (main) {
    // Leaving the inspection behind happens before the sign-in page's first byte (#1089).
    if (SignInPage(url)) Shield(true);
    CefRefPtr<CefDictionaryValue> message = Event("navigate", id_);
    message->SetString("url", url);
    message->SetBool("redirect", is_redirect);
    Send(message);
  }
  return false;
}

void Page::OnRenderProcessTerminated(CefRefPtr<CefBrowser>, TerminationStatus status, int, const CefString&) {
  CefRefPtr<CefDictionaryValue> message = Event("gone", id_);
  message->SetInt("status", static_cast<int>(status));
  Send(message);
}

// Downloads, dialogs and permissions: the host answers --------------------------------------------

bool Page::CanDownload(CefRefPtr<CefBrowser>, const CefString&, const CefString&) { return !closing_; }

bool Page::OnBeforeDownload(CefRefPtr<CefBrowser>, CefRefPtr<CefDownloadItem> item, const CefString& suggested_name, CefRefPtr<CefBeforeDownloadCallback> callback) {
  CefRefPtr<CefDictionaryValue> details = CefDictionaryValue::Create();
  details->SetInt("download", static_cast<int>(item->GetId()));
  details->SetString("name", suggested_name);
  details->SetString("url", item->GetURL());
  details->SetString("mime", item->GetMimeType());
  details->SetDouble("total", static_cast<double>(item->GetTotalBytes()));
  // Without a path the callback is dropped, which cancels the download.
  Engine::Get()->Ask(id_, "download", details, [callback](CefRefPtr<CefDictionaryValue> answer) {
    const std::string path = Text(answer, "path");
    if (!path.empty()) callback->Continue(path, false);
  });
  return true;
}

void Page::OnDownloadUpdated(CefRefPtr<CefBrowser>, CefRefPtr<CefDownloadItem> item, CefRefPtr<CefDownloadItemCallback>) {
  CefRefPtr<CefDictionaryValue> message = Event("download", id_);
  message->SetInt("download", static_cast<int>(item->GetId()));
  message->SetString("state", item->IsComplete() ? "completed" : item->IsCanceled() ? "cancelled" : item->IsInterrupted() ? "interrupted" : "progressing");
  message->SetDouble("received", static_cast<double>(item->GetReceivedBytes()));
  message->SetDouble("total", static_cast<double>(item->GetTotalBytes()));
  message->SetString("path", item->GetFullPath());
  Send(message);
}

bool Page::OnJSDialog(CefRefPtr<CefBrowser>, const CefString& origin_url, JSDialogType dialog_type, const CefString& message_text,
                      const CefString& default_prompt_text, CefRefPtr<CefJSDialogCallback> callback, bool&) {
  CefRefPtr<CefDictionaryValue> details = CefDictionaryValue::Create();
  details->SetString("type", dialog_type == JSDIALOGTYPE_ALERT ? "alert" : dialog_type == JSDIALOGTYPE_CONFIRM ? "confirm" : "prompt");
  details->SetString("message", message_text);
  details->SetString("prompt", default_prompt_text);
  details->SetString("origin", origin_url);
  Engine::Get()->Ask(id_, "dialog", details, [callback](CefRefPtr<CefDictionaryValue> answer) { callback->Continue(Flag(answer, "ok"), Text(answer, "text")); });
  return true;
}

bool Page::OnBeforeUnloadDialog(CefRefPtr<CefBrowser>, const CefString&, bool, CefRefPtr<CefJSDialogCallback> callback) {
  // Leaving a page is never held up by the site.
  callback->Continue(true, CefString());
  return true;
}

bool Page::OnFileDialog(CefRefPtr<CefBrowser>, FileDialogMode mode, const CefString& title, const CefString& default_file_path,
                        const std::vector<CefString>& accept_filters, const std::vector<CefString>&, const std::vector<CefString>&,
                        CefRefPtr<CefFileDialogCallback> callback) {
  CefRefPtr<CefDictionaryValue> details = CefDictionaryValue::Create();
  details->SetString("mode", mode == FILE_DIALOG_OPEN_MULTIPLE ? "multiple" : mode == FILE_DIALOG_OPEN_FOLDER ? "folder" : mode == FILE_DIALOG_SAVE ? "save" : "open");
  details->SetString("title", title);
  details->SetString("path", default_file_path);
  CefRefPtr<CefListValue> accept = CefListValue::Create();
  for (size_t i = 0; i < accept_filters.size() && i < 64; ++i) accept->SetString(i, accept_filters[i]);
  details->SetList("accept", accept);
  Engine::Get()->Ask(id_, "file", details, [callback](CefRefPtr<CefDictionaryValue> answer) {
    std::vector<CefString> paths;
    if (answer->GetType("paths") == VTYPE_LIST) {
      CefRefPtr<CefListValue> list = answer->GetList("paths");
      for (size_t i = 0; i < list->GetSize(); ++i)
        if (list->GetType(i) == VTYPE_STRING) paths.push_back(list->GetString(i));
    }
    if (paths.empty()) callback->Cancel();
    else callback->Continue(paths);
  });
  return true;
}

bool Page::OnRequestMediaAccessPermission(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame>, const CefString& requesting_origin, uint32_t requested,
                                          CefRefPtr<CefMediaAccessCallback> callback) {
  const uint32_t devices = CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE | CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE;
  // Screen and system-audio capture are not offered to websites.
  if (requested & ~devices) {
    callback->Continue(CEF_MEDIA_PERMISSION_NONE);
    return true;
  }
  CefRefPtr<CefDictionaryValue> details = CefDictionaryValue::Create();
  details->SetString("origin", requesting_origin);
  details->SetBool("audio", requested & CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE);
  details->SetBool("video", requested & CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE);
  const std::string origin = requesting_origin;
  Engine::Get()->Ask(id_, "media", details, [browser, callback, requested, origin](CefRefPtr<CefDictionaryValue> answer) {
    const bool allow = Flag(answer, "allow");
    // The site's Permissions API then reads "granted", as in Chrome, so a call stops showing its own
    // "use your microphone and camera?" step. Every new page still asks the host first.
    if (allow) {
      CefRefPtr<CefRequestContext> context = browser->GetHost()->GetRequestContext();
      if (requested & CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE)
        context->SetContentSetting(origin, origin, CEF_CONTENT_SETTING_TYPE_MEDIASTREAM_MIC, CEF_CONTENT_SETTING_VALUE_ALLOW);
      if (requested & CEF_MEDIA_PERMISSION_DEVICE_VIDEO_CAPTURE)
        context->SetContentSetting(origin, origin, CEF_CONTENT_SETTING_TYPE_MEDIASTREAM_CAMERA, CEF_CONTENT_SETTING_VALUE_ALLOW);
    }
    callback->Continue(allow ? requested : CEF_MEDIA_PERMISSION_NONE);
  });
  return true;
}

bool Page::OnShowPermissionPrompt(CefRefPtr<CefBrowser>, uint64_t, const CefString& requesting_origin, uint32_t requested,
                                  CefRefPtr<CefPermissionPromptCallback> callback) {
  if (requested != CEF_PERMISSION_TYPE_GEOLOCATION) {
    callback->Continue(CEF_PERMISSION_RESULT_DENY);
    return true;
  }
  CefRefPtr<CefDictionaryValue> details = CefDictionaryValue::Create();
  details->SetString("origin", requesting_origin);
  Engine::Get()->Ask(id_, "location", details, [callback](CefRefPtr<CefDictionaryValue> answer) {
    callback->Continue(Flag(answer, "allow") ? CEF_PERMISSION_RESULT_ACCEPT : CEF_PERMISSION_RESULT_DENY);
  });
  return true;
}

void Page::OnBeforeContextMenu(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>, CefRefPtr<CefContextMenuParams>, CefRefPtr<CefMenuModel> model) { model->Clear(); }

bool Page::OnDevToolsMessage(CefRefPtr<CefBrowser>, const void* message, size_t message_size) {
  // While a sign-in page shows, protocol events (page content) stay in the engine; replies still go.
  static const char kEvent[] = "{\"method\"";
  if (shielded_ && message_size >= sizeof kEvent - 1 && std::memcmp(message, kEvent, sizeof kEvent - 1) == 0) return true;
  CefRefPtr<CefDictionaryValue> event = Event("devtools", id_);
  event->SetString("m", std::string(static_cast<const char*>(message), message_size));
  Send(event);
  return true;
}
