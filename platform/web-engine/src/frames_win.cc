#include "frames.h"

#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <windows.h>
#include <wrl/client.h>
#include <algorithm>
#include <chrono>
#include <map>
#include <mutex>
#include <thread>
#include <utility>

using Microsoft::WRL::ComPtr;

namespace {
constexpr int kSlots = 3;

struct Slot {
  ComPtr<ID3D11Texture2D> texture;
  HANDLE shared = nullptr;  // our NT handle
  HANDLE remote = nullptr;  // the same texture's handle inside the host process
  uint32_t generation = 0;
  bool busy = false;
};

struct Ring {
  Slot slots[kSlots];
  UINT width = 0, height = 0;
  DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
  uint32_t generation = 0;
  bool dropped = false;
};

class WinFrameSink : public FrameSink {
 public:
  WinFrameSink(Channel* channel, HANDLE host) : channel_(channel), host_(host) {
    ComPtr<ID3D11Device> device;
    const D3D_FEATURE_LEVEL levels[] = {D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
    if (SUCCEEDED(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 2, D3D11_SDK_VERSION, &device, nullptr, &context_)))
      device.As(&device_);
    if (device_) {
      D3D11_QUERY_DESC query = {D3D11_QUERY_EVENT, 0};
      device_->CreateQuery(&query, &done_);
    }
  }
  ~WinFrameSink() override {
    for (auto& entry : rings_)
      for (Slot& slot : entry.second.slots) Clear(slot);
    if (host_) CloseHandle(host_);
  }

  bool Publish(int id, int kind, const CefAcceleratedPaintInfo& info) override {
    if (!device_ || !host_ || !info.shared_texture_handle) return true;
    ComPtr<ID3D11Texture2D> source;
    if (FAILED(device_->OpenSharedResource1(info.shared_texture_handle, IID_PPV_ARGS(&source)))) return true;
    D3D11_TEXTURE2D_DESC desc = {};
    source->GetDesc(&desc);
    if (!desc.Width || !desc.Height) return true;
    Ring& ring = rings_[{id, kind}];
    if (ring.width != desc.Width || ring.height != desc.Height || ring.format != desc.Format) {
      for (Slot& slot : ring.slots)
        if (!slot.busy) Clear(slot);
      ring.width = desc.Width;
      ring.height = desc.Height;
      ring.format = desc.Format;
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
    bool fresh = false;
    if (!slot.texture || slot.generation != ring.generation) {
      Clear(slot);
      D3D11_TEXTURE2D_DESC own = {};
      own.Width = desc.Width;
      own.Height = desc.Height;
      own.MipLevels = 1;
      own.ArraySize = 1;
      own.Format = desc.Format;
      own.SampleDesc.Count = 1;
      own.Usage = D3D11_USAGE_DEFAULT;
      own.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
      own.MiscFlags = D3D11_RESOURCE_MISC_SHARED | D3D11_RESOURCE_MISC_SHARED_NTHANDLE;
      if (FAILED(device_->CreateTexture2D(&own, nullptr, &slot.texture))) return true;
      ComPtr<IDXGIResource1> resource;
      if (FAILED(slot.texture.As(&resource)) ||
          FAILED(resource->CreateSharedHandle(nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE, nullptr, &slot.shared)) ||
          !DuplicateHandle(GetCurrentProcess(), slot.shared, host_, &slot.remote, 0, FALSE, DUPLICATE_SAME_ACCESS)) {
        Clear(slot);
        return true;
      }
      slot.generation = ring.generation;
      fresh = true;
    }
    context_->CopyResource(slot.texture.Get(), source.Get());
    // The source returns to CEF's pool when this callback ends, so the copy must be complete.
    context_->End(done_.Get());
    context_->Flush();
    while (context_->GetData(done_.Get(), nullptr, 0, 0) == S_FALSE) YieldProcessor();
    slot.busy = true;
    ring.dropped = false;
    CefRefPtr<CefDictionaryValue> message = Message("frame");
    message->SetInt("id", id);
    message->SetInt("k", kind);
    message->SetInt("s", index);
    message->SetInt("g", static_cast<int>(slot.generation));
    message->SetInt("w", static_cast<int>(desc.Width));
    message->SetInt("h", static_cast<int>(desc.Height));
    message->SetString("f", desc.Format == DXGI_FORMAT_R8G8B8A8_UNORM ? "rgba" : "bgra");
    // The host imports the handle once per slot and generation.
    if (fresh) message->SetDouble("handle", static_cast<double>(reinterpret_cast<uintptr_t>(slot.remote)));
    channel_->Send(message);
    return true;
  }

  bool Acknowledge(int id, int kind, int slot) override {
    auto found = rings_.find({id, kind});
    if (found == rings_.end() || slot < 0 || slot >= kSlots) return false;
    Ring& ring = found->second;
    Slot& entry = ring.slots[slot];
    entry.busy = false;
    if (entry.generation != ring.generation) Clear(entry);
    return ring.dropped;
  }

  void Forget(int id) override {
    for (int kind = 0; kind < 2; ++kind) {
      auto found = rings_.find({id, kind});
      if (found == rings_.end()) continue;
      for (Slot& slot : found->second.slots) Clear(slot);
      rings_.erase(found);
    }
  }

 private:
  void Clear(Slot& slot) {
    // Closes the host's copy too, so a replaced or released surface leaves no handle behind.
    if (slot.remote) DuplicateHandle(host_, slot.remote, nullptr, nullptr, 0, FALSE, DUPLICATE_CLOSE_SOURCE);
    if (slot.shared) CloseHandle(slot.shared);
    slot.remote = nullptr;
    slot.shared = nullptr;
    slot.texture.Reset();
  }

  Channel* channel_;
  HANDLE host_;
  ComPtr<ID3D11Device1> device_;
  ComPtr<ID3D11DeviceContext> context_;
  ComPtr<ID3D11Query> done_;
  std::map<std::pair<int, int>, Ring> rings_;
};
}  // namespace

std::unique_ptr<FrameSink> FrameSink::Create(Channel* channel, const std::string&, int64_t host_pid) {
  HANDLE host = OpenProcess(PROCESS_DUP_HANDLE, FALSE, static_cast<DWORD>(host_pid));
  return std::make_unique<WinFrameSink>(channel, host);
}

namespace {
#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif

// Wakes the frame clock on a high-resolution waitable timer from a thread of its own. The engine's
// ordinary delayed tasks wake on the system's 15.6 ms timer tick, which drops a panel page's frames
// to about 50 a second.
class FrameClock {
 public:
  static FrameClock& Get() {
    static FrameClock* clock = new FrameClock();  // lives as long as the engine
    return *clock;
  }
  void Post(CefRefPtr<CefTask> task, int64_t delay_ms) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      tasks_.emplace(std::chrono::steady_clock::now() + std::chrono::milliseconds(delay_ms), task);
    }
    SetEvent(wake_);
  }

 private:
  FrameClock() {
    timer_ = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
    if (!timer_) timer_ = CreateWaitableTimerW(nullptr, FALSE, nullptr);  // before Windows 10 1803
    wake_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    std::thread([this] { Run(); }).detach();
  }
  void Run() {
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
    for (;;) {
      std::multimap<std::chrono::steady_clock::time_point, CefRefPtr<CefTask>> due;
      std::chrono::steady_clock::time_point next = std::chrono::steady_clock::time_point::max();
      {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto end = tasks_.upper_bound(std::chrono::steady_clock::now());
        due.insert(tasks_.begin(), end);
        tasks_.erase(tasks_.begin(), end);
        if (!tasks_.empty()) next = tasks_.begin()->first;
      }
      for (auto& entry : due) CefPostTask(TID_UI, entry.second);
      if (next != std::chrono::steady_clock::time_point::max()) {
        // A negative due time is relative, in 100-nanosecond units.
        const auto wait = std::chrono::duration_cast<std::chrono::duration<int64_t, std::ratio<1, 10000000>>>(next - std::chrono::steady_clock::now()).count();
        LARGE_INTEGER when;
        when.QuadPart = -std::max<int64_t>(wait, 1);
        SetWaitableTimer(timer_, &when, 0, nullptr, nullptr, FALSE);
      }
      HANDLE handles[] = {wake_, timer_};
      WaitForMultipleObjects(2, handles, FALSE, INFINITE);
    }
  }

  HANDLE timer_ = nullptr;
  HANDLE wake_ = nullptr;
  std::mutex mutex_;
  std::multimap<std::chrono::steady_clock::time_point, CefRefPtr<CefTask>> tasks_;
};
}  // namespace

void PostFrameTask(CefRefPtr<CefTask> task, int64_t delay_ms) {
  FrameClock::Get().Post(task, delay_ms);
}
