#pragma once
// Windowless frames for the host. CEF lends each frame's GPU texture only for the duration of
// OnAcceleratedPaint, so the sink copies it into a small ring of surfaces it owns and shares with
// the host (IOSurface over Mach on macOS, a duplicated NT handle on Windows), then sends a `frame`
// message naming the slot. The host acknowledges a slot once nothing reads it any more. On Linux
// pages paint pixels (OnPaint) into a ring of shared-memory files instead (frames_linux.cc).
#include <cstdint>
#include <memory>
#include <string>
#include "include/cef_render_handler.h"
#include "include/cef_task.h"
#include "channel.h"

// The host's key for one shared surface: page id, element (0 view, 1 popup widget) and slot.
inline double SurfaceTag(int id, int kind, int slot) { return static_cast<double>(id) * 256 + kind * 16 + slot; }

class FrameSink {
 public:
  // `rendezvous` names the host's Mach service (macOS); `host_pid` is the Electron process.
  static std::unique_ptr<FrameSink> Create(Channel* channel, const std::string& rendezvous, int64_t host_pid);
  virtual ~FrameSink() = default;
  // UI thread. False when every slot is still in the host's hands: the frame is dropped and
  // Acknowledge later reports that the element needs a repaint.
  virtual bool Publish(int id, int kind, const CefAcceleratedPaintInfo& info) = 0;
  // The same for a frame CEF paints as BGRA pixels, valid only during OnPaint. Pages hand frames
  // over as pixels only to a sink that takes no GPU textures.
  virtual bool Paint(int id, int kind, const void* pixels, int width, int height) { return true; }
  virtual bool textures() const { return true; }
  // True when a frame was dropped since the last publish and the element should repaint.
  virtual bool Acknowledge(int id, int kind, int slot) = 0;
  virtual void Forget(int id) = 0;
};

// The frame clock's wake: runs `task` on the UI thread `delay_ms` from now, on time. macOS
// coalesces the engine's ordinary timers, waking them up to tens of milliseconds late, which
// would cap a page well below 60 frames a second; there the wake is a strict timer. On Windows
// they wake on the 15.6 ms system timer tick; there the wake is a high-resolution waitable timer.
void PostFrameTask(CefRefPtr<CefTask> task, int64_t delay_ms);
