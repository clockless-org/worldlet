// Linux entry of `worldlet-web`. The same executable serves Chromium's zygote, renderer, GPU and
// utility processes, which return from CefExecuteProcess before the engine starts.
#include "include/base/cef_compiler_specific.h"
#include "include/cef_app.h"
#include "engine.h"

// The zygote forks from inside main, so main runs without a stack protector (as in CEF's samples).
NO_STACK_PROTECTOR
int main(int argc, char* argv[]) {
  const int code = CefExecuteProcess(CefMainArgs(argc, argv), nullptr, nullptr);
  if (code >= 0) return code;
  // Chromium sees no switches from the launch command; the engine reads its own in RunEngine.
  return RunEngine(argc, argv, CefMainArgs(1, argv), nullptr, EngineOptions());
}
