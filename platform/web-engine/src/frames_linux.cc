#include "frames.h"

#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
#include <map>
#include <string>
#include <utility>

namespace {
constexpr int kSlots = 3;

struct Slot {
  int file = -1;
  size_t size = 0;
  bool busy = false;
};

struct Ring {
  Slot slots[kSlots];
  int width = 0, height = 0;
  uint32_t generation = 0;
  bool dropped = false;
};

bool Write(int file, const void* data, size_t size) {
  const char* bytes = static_cast<const char*>(data);
  for (size_t done = 0; done < size;) {
    const ssize_t written = pwrite(file, bytes + done, size - done, static_cast<off_t>(done));
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return false;
    done += static_cast<size_t>(written);
  }
  return true;
}

// Software frames: pages paint BGRA pixels (OnPaint) and the sink copies each frame into a ring of
// three files in /dev/shm, readable by this user only and named by this process, page, element and
// slot (`/dev/shm/worldlet-web-<pid>-<id>-<kind>-<slot>`), so the host finds a frame from its
// `frame` message alone. The host reads the slot, then acknowledges it. Writing with pwrite rather
// than through a mapping turns a full /dev/shm into a dropped frame instead of a crash.
class LinuxFrameSink : public FrameSink {
 public:
  explicit LinuxFrameSink(Channel* channel) : channel_(channel), prefix_("/dev/shm/worldlet-web-" + std::to_string(getpid()) + "-") {}
  ~LinuxFrameSink() override {
    for (auto& entry : rings_)
      for (int slot = 0; slot < kSlots; ++slot) Remove(entry.first.first, entry.first.second, slot, entry.second.slots[slot]);
  }

  bool textures() const override { return false; }
  // CEF hands this sink no GPU textures (textures() is false).
  bool Publish(int, int, const CefAcceleratedPaintInfo&) override { return true; }

  bool Paint(int id, int kind, const void* pixels, int width, int height) override {
    if (!pixels || width <= 0 || height <= 0) return true;
    Ring& ring = rings_[{id, kind}];
    if (ring.width != width || ring.height != height) {
      ring.width = width;
      ring.height = height;
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
    if (slot.file < 0) {
      slot.file = open(Path(id, kind, index).c_str(), O_RDWR | O_CREAT | O_TRUNC | O_CLOEXEC | O_NOFOLLOW, 0600);
      slot.size = 0;
      if (slot.file < 0) return true;
    }
    const size_t size = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
    // A smaller frame gives the rest of the file back.
    if (size < slot.size && ftruncate(slot.file, static_cast<off_t>(size)) == 0) slot.size = size;
    if (!Write(slot.file, pixels, size)) return true;
    if (size > slot.size) slot.size = size;
    slot.busy = true;
    ring.dropped = false;
    CefRefPtr<CefDictionaryValue> message = Message("frame");
    message->SetInt("id", id);
    message->SetInt("k", kind);
    message->SetInt("s", index);
    message->SetInt("g", static_cast<int>(ring.generation));
    message->SetInt("w", width);
    message->SetInt("h", height);
    message->SetString("f", "bgra");
    channel_->Send(message);
    return true;
  }

  bool Acknowledge(int id, int kind, int slot) override {
    auto found = rings_.find({id, kind});
    if (found == rings_.end() || slot < 0 || slot >= kSlots) return false;
    found->second.slots[slot].busy = false;
    return found->second.dropped;
  }

  void Forget(int id) override {
    for (int kind = 0; kind < 2; ++kind) {
      auto found = rings_.find({id, kind});
      if (found == rings_.end()) continue;
      for (int slot = 0; slot < kSlots; ++slot) Remove(id, kind, slot, found->second.slots[slot]);
      rings_.erase(found);
    }
  }

 private:
  std::string Path(int id, int kind, int slot) const { return prefix_ + std::to_string(id) + "-" + std::to_string(kind) + "-" + std::to_string(slot); }
  void Remove(int id, int kind, int index, Slot& slot) {
    if (slot.file < 0) return;
    close(slot.file);
    unlink(Path(id, kind, index).c_str());
    slot.file = -1;
  }

  Channel* channel_;
  const std::string prefix_;
  std::map<std::pair<int, int>, Ring> rings_;
};
}  // namespace

std::unique_ptr<FrameSink> FrameSink::Create(Channel* channel, const std::string&, int64_t) { return std::make_unique<LinuxFrameSink>(channel); }

void PostFrameTask(CefRefPtr<CefTask> task, int64_t delay_ms) {
  CefPostDelayedTask(TID_UI, task, delay_ms);
}
