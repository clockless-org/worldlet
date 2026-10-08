# Docker

## Runtime

Native Peek → Open container inventory → Focus container metadata. Uses the
installed Docker CLI; no Hub account is needed. Reads up to 100 recent containers
from the active **local** engine context. Remote TCP/SSH contexts are refused.

Commands are fixed: context show/inspect, container ls/inspect. Container inspect
selects ID/name/image/status/timestamps/restarts/exit code; environment, command
arguments, labels, mounts, logs and healthcheck output are never requested. No
start/stop, exec, pull, removal or automatic Docker installation.

## Status

Building. Mocked CLI and rendered UI tests; actual Docker Desktop acceptance
pending. Mac curated-source capability required; Windows adapter parity unverified.
