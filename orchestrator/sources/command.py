"""Generic ``command`` live source kind.

A dynamic manifest declares an ``argv`` to run each tick; the orchestrator
executes it deterministically (no LLM in the loop), parses stdout, and emits a
JSON payload whose keys are pinned by the manifest's ``outputSchema``.

Trust boundary (solo-local): argv comes *only* from a manifest stored in the
managed ``dynamic/`` directory — never from a HUD envelope or model output. Each
tick is bounded by a timeout and an output cap; a timeout / non-zero exit / spawn
failure degrades to a ``caution`` payload instead of raising. The process is
launched with ``create_subprocess_exec`` (argv list, no shell), so manifest
strings are never interpreted by a shell. See docs/decisions/0005-*.
"""

from __future__ import annotations

import asyncio
import csv
import json
import re
from typing import Any, Awaitable, Callable

DEFAULT_TIMEOUT_MS = 2000
MAX_TIMEOUT_MS = 10_000
DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
MAX_OUTPUT_BYTES_CAP = 4 * 1024 * 1024
MAX_SUMMARY_ITEMS = 8

Fetcher = Callable[[dict[str, Any] | None], Awaitable[dict[str, Any]]]


def build_command_fetcher(manifest: dict[str, Any]) -> Fetcher | None:
    """Build a deterministic per-tick fetcher from a ``command`` manifest.

    Returns ``None`` when the manifest is malformed (so the loader skips it).
    """
    argv = manifest.get("argv")
    if (
        not isinstance(argv, list)
        or not argv
        or not all(isinstance(arg, str) and arg for arg in argv)
    ):
        return None

    source_id = str(manifest.get("id") or "command")
    parse_spec = manifest.get("parse") if isinstance(manifest.get("parse"), dict) else {}
    state_spec = manifest.get("state") if isinstance(manifest.get("state"), dict) else {}
    constants = manifest.get("constants") if isinstance(manifest.get("constants"), dict) else {}
    timeout_ms = _clamp_int(manifest.get("timeoutMs"), DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS)
    max_bytes = _clamp_int(
        manifest.get("maxOutputBytes"), DEFAULT_MAX_OUTPUT_BYTES, 1, MAX_OUTPUT_BYTES_CAP
    )
    # Approval gate: a manifest may stay pending until explicitly approved.
    # Absence of the field means "approved" (solo-local file-present = active).
    approved = manifest.get("approved", True) is not False

    async def fetch(params: dict[str, Any] | None = None) -> dict[str, Any]:
        if not approved:
            return _caution(source_id, "pending_approval")

        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (FileNotFoundError, OSError) as exc:
            return _caution(source_id, f"spawn_failed: {exc}")

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=timeout_ms / 1000
            )
        except asyncio.TimeoutError:
            await _terminate(process)
            return _caution(source_id, f"timeout_after_{timeout_ms}ms")

        if process.returncode != 0:
            stderr = stderr_bytes[:512].decode("utf-8", errors="replace").strip()
            return _caution(
                source_id,
                f"exit_{process.returncode}: {stderr}" if stderr else f"exit_{process.returncode}",
                exit_code=process.returncode,
            )

        stdout = stdout_bytes[:max_bytes].decode("utf-8", errors="replace")
        parsed = parse_output(stdout, parse_spec)
        fields = {**constants, **parsed}
        return {
            **fields,
            "state": compute_state(fields, state_spec),
            "summaryItems": build_summary_items(parsed),
            "_source": {"source": source_id, "kind": "command", "exitCode": 0},
        }

    return fetch


def parse_output(stdout: str, spec: dict[str, Any]) -> dict[str, Any]:
    parse_type = spec.get("type", "csv")
    if parse_type == "json":
        return _parse_json(stdout, spec)
    if parse_type == "regex":
        return _parse_regex(stdout, spec)
    return _parse_csv(stdout, spec)


def _parse_csv(stdout: str, spec: dict[str, Any]) -> dict[str, Any]:
    columns = spec.get("columns")
    if not isinstance(columns, list):
        return {}
    numeric = bool(spec.get("numeric"))
    row: list[str] | None = None
    for line in stdout.splitlines():
        if line.strip():
            row = next(csv.reader([line]), None)
            break
    if row is None:
        return {}
    values = [value.strip() for value in row]
    fields: dict[str, Any] = {}
    for index, column in enumerate(columns):
        if index < len(values):
            fields[str(column)] = _coerce(values[index], numeric)
    return fields


def _parse_json(stdout: str, spec: dict[str, Any]) -> dict[str, Any]:
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError:
        return {}
    if isinstance(value, dict):
        pick = spec.get("pick")
        if isinstance(pick, list):
            return {key: value[key] for key in pick if key in value}
        return value
    return {"value": value}


def _parse_regex(stdout: str, spec: dict[str, Any]) -> dict[str, Any]:
    pattern = spec.get("pattern")
    if not isinstance(pattern, str):
        return {}
    try:
        match = re.search(pattern, stdout)
    except re.error:
        return {}
    if not match:
        return {}
    numeric = bool(spec.get("numeric"))
    return {
        key: _coerce(value, numeric)
        for key, value in match.groupdict().items()
        if value is not None
    }


def compute_state(fields: dict[str, Any], spec: dict[str, Any]) -> str:
    field = spec.get("field")
    if not isinstance(field, str) or field not in fields:
        return "info"
    value = fields[field]
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return "info"

    critical = spec.get("critical")
    caution = spec.get("caution")
    # "above": high values are bad (temperature, utilization). "below": low is bad.
    below = spec.get("direction") == "below"
    if below:
        if isinstance(critical, (int, float)) and value <= critical:
            return "critical"
        if isinstance(caution, (int, float)) and value <= caution:
            return "caution"
    else:
        if isinstance(critical, (int, float)) and value >= critical:
            return "critical"
        if isinstance(caution, (int, float)) and value >= caution:
            return "caution"
    return "stable"


def build_summary_items(fields: dict[str, Any]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for key, value in fields.items():
        if key.startswith("_") or isinstance(value, (list, dict)):
            continue
        items.append({"label": str(key), "value": str(value)})
        if len(items) >= MAX_SUMMARY_ITEMS:
            break
    return items


async def _terminate(process: asyncio.subprocess.Process) -> None:
    try:
        process.kill()
    except ProcessLookupError:
        return
    try:
        await process.communicate()
    except Exception:  # noqa: BLE001 - cleanup must never raise into the loop.
        pass


def _caution(source_id: str, reason: str, exit_code: int | None = None) -> dict[str, Any]:
    return {
        "state": "caution",
        "error": reason,
        "summaryItems": [
            {"label": "Source", "value": source_id},
            {"label": "Status", "value": reason},
        ],
        "_source": {"source": source_id, "kind": "command", "exitCode": exit_code},
    }


def _coerce(value: str, numeric: bool) -> Any:
    if not numeric:
        return value
    try:
        number = float(value)
    except ValueError:
        return value
    return int(number) if number.is_integer() else number


def _clamp_int(value: Any, default: int, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return max(low, min(int(value), high))
