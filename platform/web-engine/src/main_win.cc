// Windows entry of `Worldlet Web.exe`. The same executable serves Chromium's renderer, GPU and
// utility processes, which return from CefExecuteProcess before the engine starts.
#include <windows.h>
#include "include/cef_app.h"
#include "engine.h"

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int) {
  CefMainArgs args(instance);
  const int code = CefExecuteProcess(args, nullptr, nullptr);
  if (code >= 0) return code;
  return RunEngine(0, nullptr, args, nullptr, EngineOptions());
}
