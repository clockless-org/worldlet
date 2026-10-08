// Host side of the engine's shared surfaces on macOS (../src/frames_mac.mm sends them). Electron's
// sharedTexture imports an IOSurfaceRef of the importing process, so the Electron main process takes
// each surface's Mach send right here, from the engine's process only, and hands JavaScript the
// pointer. Loaded by platform/electron/src/modules/browser/engine/surfaces.ts.
#import <Foundation/Foundation.h>
#import <IOSurface/IOSurface.h>
#include <bsm/libbsm.h>
#include <mach/mach.h>
#include <node_api.h>
#include <servers/bootstrap.h>
#include <unistd.h>
#include <atomic>
#include <cstdlib>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <utility>

namespace {
constexpr mach_msg_id_t kSurfaceMessage = 0x574c5753;
constexpr mach_msg_id_t kStopMessage = 0x574c5354;

struct SurfaceMessage {
  mach_msg_header_t header;
  mach_msg_body_t body;
  mach_msg_port_descriptor_t surface;
  uint64_t tag;
  uint32_t generation;
  uint32_t reserved;
};
struct Received {
  SurfaceMessage message;
  mach_msg_audit_trailer_t trailer;
};

std::mutex lock;
std::map<std::pair<uint64_t, uint32_t>, IOSurfaceRef> surfaces;
mach_port_t receive = MACH_PORT_NULL;
std::atomic<pid_t> sender{0};
std::string service;

void Loop(mach_port_t port) {
  for (;;) {
    Received received = {};
    const kern_return_t result =
        mach_msg(&received.message.header, MACH_RCV_MSG | MACH_RCV_LARGE | MACH_RCV_TRAILER_TYPE(MACH_MSG_TRAILER_FORMAT_0) | MACH_RCV_TRAILER_ELEMENTS(MACH_RCV_TRAILER_AUDIT),
                 0, sizeof received, port, MACH_MSG_TIMEOUT_NONE, MACH_PORT_NULL);
    if (result == MACH_RCV_TOO_LARGE) {
      // Not ours: receive and destroy it so it cannot block the queue.
      mach_msg_size_t size = received.message.header.msgh_size + sizeof(mach_msg_audit_trailer_t);
      auto* buffer = static_cast<mach_msg_header_t*>(calloc(1, size));
      if (mach_msg(buffer, MACH_RCV_MSG, 0, size, port, MACH_MSG_TIMEOUT_NONE, MACH_PORT_NULL) == KERN_SUCCESS) mach_msg_destroy(buffer);
      free(buffer);
      continue;
    }
    if (result != KERN_SUCCESS) return;
    mach_msg_header_t& header = received.message.header;
    if (header.msgh_id == kStopMessage) {
      mach_msg_destroy(&header);
      return;
    }
    const pid_t from = audit_token_to_pid(received.trailer.msgh_audit);
    const bool valid = header.msgh_id == kSurfaceMessage && (header.msgh_bits & MACH_MSGH_BITS_COMPLEX) && header.msgh_size == sizeof(SurfaceMessage) &&
                       received.message.body.msgh_descriptor_count == 1 && received.message.surface.type == MACH_MSG_PORT_DESCRIPTOR && from != 0 &&
                       from == sender.load();
    if (!valid) {
      mach_msg_destroy(&header);
      continue;
    }
    IOSurfaceRef surface = IOSurfaceLookupFromMachPort(received.message.surface.name);
    mach_port_deallocate(mach_task_self(), received.message.surface.name);
    if (!surface) continue;
    std::lock_guard<std::mutex> guard(lock);
    const auto key = std::make_pair(received.message.tag, received.message.generation);
    auto found = surfaces.find(key);
    if (found != surfaces.end()) CFRelease(found->second);
    surfaces[key] = surface;
  }
}

double Arg(napi_env env, napi_value value) {
  double number = 0;
  napi_get_value_double(env, value, &number);
  return number;
}

napi_value Undefined(napi_env env) {
  napi_value value;
  napi_get_undefined(env, &value);
  return value;
}

// listen(enginePid) → the Mach service name the engine looks up (--worldlet-rendezvous).
napi_value Listen(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  sender = count ? static_cast<pid_t>(Arg(env, args[0])) : 0;
  if (receive == MACH_PORT_NULL) {
    uint8_t bytes[16];
    arc4random_buf(bytes, sizeof bytes);
    char hex[33];
    for (int i = 0; i < 16; ++i) snprintf(hex + i * 2, 3, "%02x", bytes[i]);
    std::string name = "app.worldlet.web-surfaces." + std::to_string(getpid()) + "." + hex;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    const kern_return_t checked = bootstrap_check_in(bootstrap_port, name.c_str(), &receive);
#pragma clang diagnostic pop
    if (checked != KERN_SUCCESS) {
      receive = MACH_PORT_NULL;
      napi_throw_error(env, nullptr, "The shared-surface service could not start.");
      return nullptr;
    }
    service = name;
    std::thread(Loop, receive).detach();
  }
  napi_value result;
  napi_create_string_utf8(env, service.c_str(), service.size(), &result);
  return result;
}

// setSender(enginePid): a restarted engine has a new process.
napi_value SetSender(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  sender = count ? static_cast<pid_t>(Arg(env, args[0])) : 0;
  return Undefined(env);
}

// take(tag, generation) → an 8-byte Buffer holding the IOSurfaceRef, or null until it has arrived.
// The addon keeps its reference until drop/forget.
napi_value Take(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  napi_value result;
  if (count < 2) {
    napi_get_null(env, &result);
    return result;
  }
  const auto key = std::make_pair(static_cast<uint64_t>(Arg(env, args[0])), static_cast<uint32_t>(Arg(env, args[1])));
  IOSurfaceRef surface = nullptr;
  {
    std::lock_guard<std::mutex> guard(lock);
    auto found = surfaces.find(key);
    if (found != surfaces.end()) surface = found->second;
  }
  if (!surface) {
    napi_get_null(env, &result);
    return result;
  }
  void* data = nullptr;
  napi_create_buffer_copy(env, sizeof surface, &surface, &data, &result);
  return result;
}

// sample(tag, generation, x, y) → [r, g, b, a] of one device pixel, for the host's checks; null until arrived.
napi_value Sample(napi_env env, napi_callback_info info) {
  size_t count = 4;
  napi_value args[4];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  napi_value result;
  napi_get_null(env, &result);
  if (count < 4) return result;
  const auto key = std::make_pair(static_cast<uint64_t>(Arg(env, args[0])), static_cast<uint32_t>(Arg(env, args[1])));
  std::lock_guard<std::mutex> guard(lock);
  auto found = surfaces.find(key);
  if (found == surfaces.end()) return result;
  IOSurfaceRef surface = found->second;
  const size_t x = static_cast<size_t>(Arg(env, args[2])), y = static_cast<size_t>(Arg(env, args[3]));
  if (x >= IOSurfaceGetWidth(surface) || y >= IOSurfaceGetHeight(surface) || IOSurfaceLock(surface, kIOSurfaceLockReadOnly, nullptr) != kIOReturnSuccess) return result;
  const auto* pixel = static_cast<const uint8_t*>(IOSurfaceGetBaseAddress(surface)) + y * IOSurfaceGetBytesPerRow(surface) + x * 4;
  const bool rgba = IOSurfaceGetPixelFormat(surface) == 'RGBA';
  const uint8_t values[4] = {rgba ? pixel[0] : pixel[2], pixel[1], rgba ? pixel[2] : pixel[0], pixel[3]};
  IOSurfaceUnlock(surface, kIOSurfaceLockReadOnly, nullptr);
  napi_create_array_with_length(env, 4, &result);
  for (uint32_t i = 0; i < 4; ++i) {
    napi_value channel;
    napi_create_uint32(env, values[i], &channel);
    napi_set_element(env, result, i, channel);
  }
  return result;
}

void Release(uint64_t from, uint64_t to, uint32_t generation, bool any) {
  std::lock_guard<std::mutex> guard(lock);
  for (auto it = surfaces.begin(); it != surfaces.end();) {
    if (it->first.first >= from && it->first.first <= to && (any || it->first.second == generation)) {
      CFRelease(it->second);
      it = surfaces.erase(it);
    } else {
      ++it;
    }
  }
}

// drop(tag, generation): the host no longer imports this surface.
napi_value Drop(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count == 2) {
    const auto tag = static_cast<uint64_t>(Arg(env, args[0]));
    Release(tag, tag, static_cast<uint32_t>(Arg(env, args[1])), false);
  }
  return Undefined(env);
}

// forget(pageId): every surface of a closed page; forget(-1) every surface (engine restart).
napi_value Forget(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  const double id = count ? Arg(env, args[0]) : -1;
  if (id < 0) Release(0, UINT64_MAX, 0, true);
  else Release(static_cast<uint64_t>(id) * 256, static_cast<uint64_t>(id) * 256 + 255, 0, true);
  return Undefined(env);
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor methods[] = {
      {"listen", nullptr, Listen, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"setSender", nullptr, SetSender, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"take", nullptr, Take, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"drop", nullptr, Drop, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"forget", nullptr, Forget, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"sample", nullptr, Sample, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof methods / sizeof methods[0], methods);
  return exports;
}
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
