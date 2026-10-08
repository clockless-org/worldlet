#pragma once
// One windowless browser: a website page or a popup it opened. Each handler reports facts to the
// host or asks it; nothing here decides product behavior beyond the synchronous rules in policy.h.
#include <chrono>
#include <map>
#include <string>
#include "include/cef_client.h"
#include "include/cef_devtools_message_observer.h"
#include "include/cef_registration.h"

struct Geometry {
  int width = 1, height = 1;  // the page's own size in CSS pixels
  float scale = 1;            // device pixels per CSS pixel
  CefRect view;               // the page's place on screen, in screen points
  CefRect window;             // the host window on screen
  CefRect screen, available;  // the display holding it
};
// Reads `w`, `h`, `scale`, `view`, `window`, `screen` and `available` from a host message.
Geometry ReadGeometry(CefRefPtr<CefDictionaryValue> message, Geometry base);

class Page : public CefClient,
             public CefRenderHandler,
             public CefLifeSpanHandler,
             public CefLoadHandler,
             public CefDisplayHandler,
             public CefRequestHandler,
             public CefDownloadHandler,
             public CefJSDialogHandler,
             public CefDialogHandler,
             public CefPermissionHandler,
             public CefContextMenuHandler,
             public CefDevToolsMessageObserver {
 public:
  Page(int id, int opener, int group, std::string scope, Geometry geometry);
  static void Open(int id, const std::string& scope, const std::string& url, Geometry geometry, bool hidden, bool tabs);

  int id() const { return id_; }
  int group() const { return group_; }
  bool alive() const { return browser_ != nullptr; }
  void Apply(CefRefPtr<CefDictionaryValue> message);  // a host request for this page
  void Close();
  void Repaint(int kind);

  // CefClient
  CefRefPtr<CefRenderHandler> GetRenderHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefRequestHandler> GetRequestHandler() override { return this; }
  CefRefPtr<CefDownloadHandler> GetDownloadHandler() override { return this; }
  CefRefPtr<CefJSDialogHandler> GetJSDialogHandler() override { return this; }
  CefRefPtr<CefDialogHandler> GetDialogHandler() override { return this; }
  CefRefPtr<CefPermissionHandler> GetPermissionHandler() override { return this; }
  CefRefPtr<CefContextMenuHandler> GetContextMenuHandler() override { return this; }

  // CefRenderHandler: windowless geometry and frames
  bool GetRootScreenRect(CefRefPtr<CefBrowser> browser, CefRect& rect) override;
  void GetViewRect(CefRefPtr<CefBrowser> browser, CefRect& rect) override;
  bool GetScreenPoint(CefRefPtr<CefBrowser> browser, int viewX, int viewY, int& screenX, int& screenY) override;
  bool GetScreenInfo(CefRefPtr<CefBrowser> browser, CefScreenInfo& screen_info) override;
  void OnPopupShow(CefRefPtr<CefBrowser> browser, bool show) override;
  void OnPopupSize(CefRefPtr<CefBrowser> browser, const CefRect& rect) override;
  void OnPaint(CefRefPtr<CefBrowser> browser, PaintElementType type, const RectList& dirtyRects, const void* buffer, int width, int height) override;
  void OnAcceleratedPaint(CefRefPtr<CefBrowser> browser, PaintElementType type, const RectList& dirtyRects, const CefAcceleratedPaintInfo& info) override;
  void OnImeCompositionRangeChanged(CefRefPtr<CefBrowser> browser, const CefRange& selected_range, const RectList& character_bounds) override;

  // CefLifeSpanHandler
  bool OnBeforePopup(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, int popup_id, const CefString& target_url,
                     const CefString& target_frame_name, cef_window_open_disposition_t target_disposition, bool user_gesture,
                     const CefPopupFeatures& popupFeatures, CefWindowInfo& windowInfo, CefRefPtr<CefClient>& client,
                     CefBrowserSettings& settings, CefRefPtr<CefDictionaryValue>& extra_info, bool* no_javascript_access) override;
  void OnBeforePopupAborted(CefRefPtr<CefBrowser> browser, int popup_id) override;
  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override;
  void OnBeforeClose(CefRefPtr<CefBrowser> browser) override;

  // CefLoadHandler
  void OnLoadingStateChange(CefRefPtr<CefBrowser> browser, bool isLoading, bool canGoBack, bool canGoForward) override;
  void OnLoadEnd(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, int httpStatusCode) override;
  void OnLoadError(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, ErrorCode errorCode, const CefString& errorText,
                   const CefString& failedUrl) override;

  // CefDisplayHandler
  void OnAddressChange(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& url) override;
  void OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) override;
  void OnFullscreenModeChange(CefRefPtr<CefBrowser> browser, bool fullscreen) override;
  bool OnTooltip(CefRefPtr<CefBrowser> browser, CefString& text) override;
  bool OnCursorChange(CefRefPtr<CefBrowser> browser, CefCursorHandle cursor, cef_cursor_type_t type, const CefCursorInfo& custom_cursor_info) override;

  // CefRequestHandler
  bool OnBeforeBrowse(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, CefRefPtr<CefRequest> request, bool user_gesture, bool is_redirect) override;
  void OnRenderProcessTerminated(CefRefPtr<CefBrowser> browser, TerminationStatus status, int error_code, const CefString& error_string) override;

  // CefDownloadHandler
  bool CanDownload(CefRefPtr<CefBrowser> browser, const CefString& url, const CefString& request_method) override;
  bool OnBeforeDownload(CefRefPtr<CefBrowser> browser, CefRefPtr<CefDownloadItem> download_item, const CefString& suggested_name,
                        CefRefPtr<CefBeforeDownloadCallback> callback) override;
  void OnDownloadUpdated(CefRefPtr<CefBrowser> browser, CefRefPtr<CefDownloadItem> download_item, CefRefPtr<CefDownloadItemCallback> callback) override;

  // CefJSDialogHandler
  bool OnJSDialog(CefRefPtr<CefBrowser> browser, const CefString& origin_url, JSDialogType dialog_type, const CefString& message_text,
                  const CefString& default_prompt_text, CefRefPtr<CefJSDialogCallback> callback, bool& suppress_message) override;
  bool OnBeforeUnloadDialog(CefRefPtr<CefBrowser> browser, const CefString& message_text, bool is_reload, CefRefPtr<CefJSDialogCallback> callback) override;

  // CefDialogHandler
  bool OnFileDialog(CefRefPtr<CefBrowser> browser, FileDialogMode mode, const CefString& title, const CefString& default_file_path,
                    const std::vector<CefString>& accept_filters, const std::vector<CefString>& accept_extensions,
                    const std::vector<CefString>& accept_descriptions, CefRefPtr<CefFileDialogCallback> callback) override;

  // CefPermissionHandler
  bool OnRequestMediaAccessPermission(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& requesting_origin,
                                      uint32_t requested_permissions, CefRefPtr<CefMediaAccessCallback> callback) override;
  bool OnShowPermissionPrompt(CefRefPtr<CefBrowser> browser, uint64_t prompt_id, const CefString& requesting_origin, uint32_t requested_permissions,
                              CefRefPtr<CefPermissionPromptCallback> callback) override;

  // CefContextMenuHandler: website pages have no context menu, as in the Electron views.
  void OnBeforeContextMenu(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, CefRefPtr<CefContextMenuParams> params,
                           CefRefPtr<CefMenuModel> model) override;

  // CefDevToolsMessageObserver: the page's own protocol traffic goes to the host unchanged.
  bool OnDevToolsMessage(CefRefPtr<CefBrowser> browser, const void* message, size_t message_size) override;

 private:
  void Send(CefRefPtr<CefDictionaryValue> message);
  void Shield(bool on);
  void Mouse(CefRefPtr<CefDictionaryValue> message);
  void Key(CefRefPtr<CefDictionaryValue> message);
  void Ime(CefRefPtr<CefDictionaryValue> message);
  void Edit(const std::string& command);
  // The frame clock: the engine issues each shown page's BeginFrames at the rate the host set
  // (`fps`), so its animation frames follow where it shows whatever Chromium's own display does.
  void Clock();
  void Tick(int generation);

  const int id_, opener_, group_;
  const std::string scope_;
  Geometry geometry_;
  CefRefPtr<CefBrowser> browser_;
  CefRefPtr<CefRegistration> devtools_;
  std::map<int, int> popups_;  // CEF popup_id → page id while a popup is being created
  bool shielded_ = false;
  bool focused_ = false;
  bool closing_ = false;
  bool hidden_ = false;
  // A Browser tab's page: a link meant for a new tab opens one (`tab`) instead of a popup.
  bool tabs_ = false;
  int fps_ = 60;
  int clock_ = 0;  // the running clock's generation; a restart or close ends the previous one
  std::chrono::steady_clock::time_point next_frame_;
  // The last http:// navigation opened at https://, so a site that sends https:// back to http:// is not upgraded in a loop.
  std::string upgraded_;
  std::chrono::steady_clock::time_point upgraded_at_;
  IMPLEMENT_REFCOUNTING(Page);
};
