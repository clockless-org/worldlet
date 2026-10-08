// macOS entry of `Worldlet Web.app`: an accessory app (no Dock icon or menu) whose pages are
// windowless; the Electron host draws them.
#import <Cocoa/Cocoa.h>
#include <string>
#include "include/cef_application_mac.h"
#include "include/wrapper/cef_library_loader.h"
#include "engine.h"

@interface WebEngineApplication : NSApplication <CefAppProtocol>
@property(nonatomic) BOOL handlingSendEvent;
@end

@implementation WebEngineApplication
- (BOOL)isHandlingSendEvent {
  return self.handlingSendEvent;
}
- (void)sendEvent:(NSEvent*)event {
  CefScopedSendingEvent sending;
  [super sendEvent:event];
}
// Only the host ends the engine: its `quit` message or its channel closing.
- (void)terminate:(id)sender {
}
@end

int main(int argc, char* argv[]) {
  CefScopedLibraryLoader loader;
  if (!loader.LoadInMain()) return 1;
  @autoreleasepool {
    [WebEngineApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSString* frameworks = NSBundle.mainBundle.privateFrameworksPath;
    EngineOptions paths;
    paths.subprocess = [frameworks stringByAppendingPathComponent:@"Worldlet Web Helper.app/Contents/MacOS/Worldlet Web Helper"].UTF8String;
    paths.bundle = NSBundle.mainBundle.bundlePath.UTF8String;
    paths.framework = [frameworks stringByAppendingPathComponent:@"Chromium Embedded Framework.framework"].UTF8String;
    // Chromium sees no switches from the launch command; the engine reads its own in RunEngine.
    CefMainArgs args(1, argv);
    return RunEngine(argc, argv, args, nullptr, paths);
  }
}
