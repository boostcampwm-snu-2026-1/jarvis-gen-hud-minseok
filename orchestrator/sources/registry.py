"""Canonical live-source registry.

Sources are described by a :class:`SourceDescriptor` (id, kind, schema,
fetcher). Builtins are static; dynamic ``command`` sources are loaded from
manifests in :data:`DYNAMIC_DIR`. The dynamic directory is re-scanned on every
lookup so a freshly written manifest is picked up without a restart
(hot reload). This descriptor set is the single source of truth that the
frontend allow-list and the HUD system prompt are derived from (via /sources).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol

from .build_sim import fetch as fetch_build_sim
from .command import build_command_fetcher
from .disk import fetch as fetch_disk
from .proc_watch import fetch as fetch_proc_watch
from .project import fetch as fetch_project

DYNAMIC_DIR = Path(__file__).parent / "dynamic"


class Source(Protocol):
    def __call__(self, params: dict[str, Any] | None = None) -> Awaitable[dict[str, Any]]:
        ...


@dataclass(frozen=True)
class SourceDescriptor:
    """A live source's public contract plus its (non-serialized) fetcher."""

    id: str
    description: str
    kind: str  # "builtin" | "command"
    output_schema: list[str]
    fetcher: Source
    params_schema: dict[str, Any] | None = None
    default_interval_ms: int | None = None

    def describe(self) -> dict[str, Any]:
        """JSON-safe view exposed via /sources (the ``fetcher`` is omitted)."""
        return {
            "id": self.id,
            "kind": self.kind,
            "description": self.description,
            "outputSchema": list(self.output_schema),
            "paramsSchema": self.params_schema,
            "defaultIntervalMs": self.default_interval_ms,
        }


# Builtin sources keep their hand-written fetchers; the descriptor pins the exact
# push schema the frontend/prompt must reference (kept in sync with the *.py emit).
_BUILTIN: dict[str, SourceDescriptor] = {
    "disk": SourceDescriptor(
        id="disk",
        description="path capacity data for Gauge/PieChart",
        kind="builtin",
        output_schema=[
            "path", "totalBytes", "usedBytes", "freeBytes", "usedPct",
            "min", "max", "state", "summaryItems", "slices", "_source",
        ],
        fetcher=fetch_disk,
        params_schema={"path": "filesystem path (default '.')"},
    ),
    "project": SourceDescriptor(
        id="project",
        description="git status",
        kind="builtin",
        output_schema=[
            "root", "branch", "changedFiles", "stagedFiles", "unstagedFiles",
            "untrackedFiles", "files", "summaryItems", "_source",
        ],
        fetcher=fetch_project,
        params_schema={"root": "repository root (default '.')"},
    ),
    "build_sim": SourceDescriptor(
        id="build_sim",
        description="simulated build Steps/ProgressBar",
        kind="builtin",
        output_schema=[
            "startedAt", "elapsedSec", "progress", "state", "steps",
            "summaryItems", "_source",
        ],
        fetcher=fetch_build_sim,
        params_schema={
            "startedAt": "epoch seconds",
            "stepSeconds": "seconds per step",
            "failAt": "step index or name to fail",
        },
    ),
    "proc_watch": SourceDescriptor(
        id="proc_watch",
        description="manual PID polling",
        kind="builtin",
        output_schema=["pid", "running", "state", "summaryItems", "_source"],
        fetcher=fetch_proc_watch,
        params_schema={"pid": "process id (int)"},
    ),
}


def load_dynamic(directory: Path | None = None) -> dict[str, SourceDescriptor]:
    """Scan a directory of ``*.json`` manifests into descriptors.

    Malformed manifests are skipped silently so one bad file cannot take the
    whole registry down. Builtin ids cannot be shadowed (see :func:`_merged`).
    """
    directory = directory or DYNAMIC_DIR
    descriptors: dict[str, SourceDescriptor] = {}
    if not directory.is_dir():
        return descriptors
    for path in sorted(directory.glob("*.json")):
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        descriptor = descriptor_from_manifest(manifest)
        if descriptor is not None:
            descriptors[descriptor.id] = descriptor
    return descriptors


def descriptor_from_manifest(manifest: Any) -> SourceDescriptor | None:
    if not isinstance(manifest, dict):
        return None
    source_id = manifest.get("id")
    if not isinstance(source_id, str) or not source_id:
        return None
    # Phase 1 supports only the deterministic ``command`` kind.
    if manifest.get("kind") != "command":
        return None
    fetcher = build_command_fetcher(manifest)
    if fetcher is None:
        return None

    raw_schema = manifest.get("outputSchema")
    output_schema = [str(key) for key in raw_schema] if isinstance(raw_schema, list) else []
    params_schema = manifest.get("paramsSchema")
    default_interval = manifest.get("defaultIntervalMs")
    return SourceDescriptor(
        id=source_id,
        description=str(manifest.get("description") or source_id),
        kind="command",
        output_schema=output_schema,
        fetcher=fetcher,
        params_schema=params_schema if isinstance(params_schema, dict) else None,
        default_interval_ms=(
            int(default_interval)
            if isinstance(default_interval, (int, float)) and not isinstance(default_interval, bool)
            else None
        ),
    )


def _merged(directory: Path | None = None) -> dict[str, SourceDescriptor]:
    # Builtin wins over a dynamic manifest that reuses a builtin id.
    merged = load_dynamic(directory)
    merged.update(_BUILTIN)
    return merged


def get_descriptor(name: str, directory: Path | None = None) -> SourceDescriptor | None:
    if name in _BUILTIN:
        return _BUILTIN[name]
    return load_dynamic(directory).get(name)


def get_source(name: str) -> Source | None:
    descriptor = get_descriptor(name)
    return descriptor.fetcher if descriptor else None


def list_sources() -> list[str]:
    return sorted(_merged())


def describe_sources() -> list[dict[str, Any]]:
    """Builtins first (canonical order), then dynamic sources (sorted)."""
    dynamic = load_dynamic()
    ordered = list(_BUILTIN.values()) + [
        dynamic[key] for key in sorted(dynamic) if key not in _BUILTIN
    ]
    return [descriptor.describe() for descriptor in ordered]
