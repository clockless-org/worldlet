#include "frames.h"

#include <dispatch/dispatch.h>
#import <IOSurface/IOSurface.h>
#import <Metal/Metal.h>
#include <mach/mach.h>
#include <servers/bootstrap.h>
#include <map>
#include <utility>

namespace {
constexpr int kSlots = 3;
// msgh_id of a surface message; the host's receiver (addon/surface_mac.mm) checks it.
constexpr mach_msg_id_t kSurfaceMessage = 0x574c5753;

struct SurfaceMessage {
  mach_msg_header_t header;
  mach_msg_body_t body;
  mach_msg_port_descriptor_t surface;
  uint64_t tag;
  uint32_t generation;
  uint32_t reserved;
};

struct Slot {
  IOSurfaceRef surface = nullptr;
  id<MTLTexture> texture = nil;
  uint32_t generation = 0;
  bool busy = false;
};

struct Ring {
  Slot slots[kSlots];
  size_t width = 0, height = 0;
  MTLPixelFormat format = MTLPixelFormatInvalid;
  uint32_t generation = 0;
  bool dropped = false;
};

void Clear(Slot& slot) {
  if (slot.surface) CFRelease(slot.surface);
  slot.surface = nullptr;
  slot.texture = nil;
}

class MacFrameSink : public FrameSink {
 public:
  MacFrameSink(Channel* channel, mach_port_t host) : channel_(channel), host_(host) {
    device_ = MTLCreateSystemDefaultDevice();
    queue_ = [device_ newCommandQueue];
  }
  ~MacFrameSink() override {
    for (auto& entry : rings_)
      for (Slot& slot : entry.second.slots) Clear(slot);
    if (host_ != MACH_PORT_NULL) mach_port_deallocate(mach_task_self(), host_);
  }

  bool Publish(int page, int kind, const CefAcceleratedPaintInfo& info) override {
    IOSurfaceRef source = static_cast<IOSurfaceRef>(info.shared_texture_io_surface);
    if (!source || !queue_ || host_ == MACH_PORT_NULL) return true;
    const size_t width = IOSurfaceGetWidth(source), height = IOSurfaceGetHeight(source);
    if (!width || !height) return true;
    const MTLPixelFormat format = info.format == CEF_COLOR_TYPE_RGBA_8888 ? MTLPixelFormatRGBA8Unorm : MTLPixelFormatBGRA8Unorm;
    Ring& ring = rings_[{page, kind}];
    if (ring.width != width || ring.height != height || ring.format != format) {
      // A new size starts a new generation; slots the host still reads are replaced once released.
      for (Slot& slot : ring.slots)
        if (!slot.busy) Clear(slot);
      ring.width = width;
      ring.height = height;
      ring.format = format;
      ++ring.generation;
    }
    int index = -1;
    for (int i = 0; i < kSlots; ++i)
      if (!ring.slots[i].busy) {
        index = i;
        break;
      }
    if (index < 0) {
      ring.dropped = true;
      return false;
    }
    Slot& slot = ring.slots[index];
    if (!slot.surface || slot.generation != ring.generation) {
      Clear(slot);
      NSDictionary* properties = @{(__bridge id)kIOSurfaceWidth : @(width), (__bridge id)kIOSurfaceHeight : @(height), (__bridge id)kIOSurfaceBytesPerElement : @4,
                                   (__bridge id)kIOSurfacePixelFormat : @(IOSurfaceGetPixelFormat(source))};
      slot.surface = IOSurfaceCreate((__bridge CFDictionaryRef)properties);
      if (!slot.surface) return true;
      MTLTextureDescriptor* descriptor = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:format width:width height:height mipmapped:NO];
      descriptor.storageMode = MTLStorageModeShared;
      descriptor.usage = MTLTextureUsageShaderRead | MTLTextureUsageShaderWrite;
      slot.texture = [device_ newTextureWithDescriptor:descriptor iosurface:slot.surface plane:0];
      slot.generation = ring.generation;
      if (!slot.texture || !Share(slot.surface, SurfaceTag(page, kind, index), slot.generation)) {
        Clear(slot);
        return true;
      }
    }
    MTLTextureDescriptor* descriptor = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:format width:width height:height mipmapped:NO];
    descriptor.storageMode = MTLStorageModeShared;
    id<MTLTexture> input = [device_ newTextureWithDescriptor:descriptor iosurface:source plane:0];
    if (!input) return true;
    id<MTLCommandBuffer> command = [queue_ commandBuffer];
    id<MTLBlitCommandEncoder> blit = [command blitCommandEncoder];
    [blit copyFromTexture:input sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0, 0, 0) sourceSize:MTLSizeMake(width, height, 1)
                toTexture:slot.texture destinationSlice:0 destinationLevel:0 destinationOrigin:MTLOriginMake(0, 0, 0)];
    [blit endEncoding];
    [command commit];
    // The source returns to CEF's pool when this callback ends, so the copy must be complete.
    [command waitUntilCompleted];
    if (command.status != MTLCommandBufferStatusCompleted) return true;
    slot.busy = true;
    ring.dropped = false;
    CefRefPtr<CefDictionaryValue> message = Message("frame");
    message->SetInt("id", page);
    message->SetInt("k", kind);
    message->SetInt("s", index);
    message->SetInt("g", static_cast<int>(slot.generation));
    message->SetInt("w", static_cast<int>(width));
    message->SetInt("h", static_cast<int>(height));
    message->SetString("f", format == MTLPixelFormatRGBA8Unorm ? "rgba" : "bgra");
    channel_->Send(message);
    return true;
  }

  bool Acknowledge(int page, int kind, int slot) override {
    auto found = rings_.find({page, kind});
    if (found == rings_.end() || slot < 0 || slot >= kSlots) return false;
    Ring& ring = found->second;
    Slot& entry = ring.slots[slot];
    entry.busy = false;
    if (entry.generation != ring.generation) Clear(entry);
    return ring.dropped;
  }

  void Forget(int page) override {
    for (int kind = 0; kind < 2; ++kind) {
      auto found = rings_.find({page, kind});
      if (found == rings_.end()) continue;
      for (Slot& slot : found->second.slots) Clear(slot);
      rings_.erase(found);
    }
  }

 private:
  // Sends a send right for the surface to the host; the host maps (tag, generation) to it.
  bool Share(IOSurfaceRef surface, double tag, uint32_t generation) {
    mach_port_t port = IOSurfaceCreateMachPort(surface);
    if (port == MACH_PORT_NULL) return false;
    SurfaceMessage message = {};
    message.header.msgh_bits = MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, 0) | MACH_MSGH_BITS_COMPLEX;
    message.header.msgh_size = sizeof message;
    message.header.msgh_remote_port = host_;
    message.header.msgh_id = kSurfaceMessage;
    message.body.msgh_descriptor_count = 1;
    message.surface.name = port;
    message.surface.disposition = MACH_MSG_TYPE_MOVE_SEND;
    message.surface.type = MACH_MSG_PORT_DESCRIPTOR;
    message.tag = static_cast<uint64_t>(tag);
    message.generation = generation;
    const kern_return_t result = mach_msg(&message.header, MACH_SEND_MSG | MACH_SEND_TIMEOUT, sizeof message, 0, MACH_PORT_NULL, 2000, MACH_PORT_NULL);
    if (result != KERN_SUCCESS) {
      mach_port_deallocate(mach_task_self(), port);
      return false;
    }
    return true;
  }

  Channel* channel_;
  mach_port_t host_;
  id<MTLDevice> device_;
  id<MTLCommandQueue> queue_;
  std::map<std::pair<int, int>, Ring> rings_;
};
}  // namespace

std::unique_ptr<FrameSink> FrameSink::Create(Channel* channel, const std::string& rendezvous, int64_t) {
  mach_port_t host = MACH_PORT_NULL;
  if (rendezvous.empty() || bootstrap_look_up(bootstrap_port, rendezvous.c_str(), &host) != KERN_SUCCESS) host = MACH_PORT_NULL;
  return std::make_unique<MacFrameSink>(channel, host);
}

void PostFrameTask(CefRefPtr<CefTask> task, int64_t delay_ms) {
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, DISPATCH_TIMER_STRICT, dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0));
  dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, delay_ms * NSEC_PER_MSEC), DISPATCH_TIME_FOREVER, 0);
  dispatch_source_set_event_handler(timer, ^{
    dispatch_source_cancel(timer);  // releases this handler and with it the timer
    CefPostTask(TID_UI, task);
  });
  dispatch_resume(timer);
}
