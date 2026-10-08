"""Native host identity, derived from the process rather than conversational input."""
import sys


def name():
    return {"win32": "Windows", "darwin": "macOS", "linux": "Linux"}.get(sys.platform, "an unspecified operating system")


def guidance():
    system = name()
    return (f"Runtime platform: {system}. Worldlet and this Hermes process are running on this computer. "
            f"Use {system} paths and interface names when giving platform-specific setup instructions. "
            "Platform identity does not grant tools or prove feature support. Discover World capabilities "
            "and use actual tool results; do not assume a feature exists because it exists on another platform.")
