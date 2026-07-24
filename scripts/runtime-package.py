import argparse
import hashlib
import json
import os
import stat
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath


MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_FILES = 4096
MAX_RUNTIME_BYTES = 256 * 1024 * 1024
CONFIG_FIELDS = {
    "schemaVersion",
    "runtimeRevision",
    "sequence",
    "channel",
    "baselineRange",
    "bootstrapApiVersion",
    "runtimeApiVersion",
    "lifetimeDays",
    "sourceRoot",
    "entries",
}
SIGNED_FIELDS = {
    "schemaVersion",
    "runtimeRevision",
    "sequence",
    "channel",
    "baselineRange",
    "bootstrapApiVersion",
    "runtimeApiVersion",
    "issuedAt",
    "expiresAt",
    "files",
}
DENIED_NAMES = {".env", ".npmrc", ".pypirc"}
DENIED_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".mobileprovision"}
DENIED_DIRECTORIES = {".git", ".idea", "__pycache__", "dist", "node_modules", "runtime-output"}


class PackageError(Exception):
    pass


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PackageError(f"Cannot read JSON: {path}") from error


def require_exact_fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != expected:
        raise PackageError(f"{label} fields are not valid")


def require_positive_integer(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_SAFE_INTEGER:
        raise PackageError(f"{label} must be a positive safe integer")


def safe_parts(value, label):
    if not isinstance(value, str) or not value or "\\" in value:
        raise PackageError(f"{label} is not a safe relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise PackageError(f"{label} is not a safe relative path")
    return path.parts


def validate_target(value):
    parts = safe_parts(value, "Runtime target")
    if value == "manifest.json":
        raise PackageError("manifest.json is reserved")
    return parts


def source_root_parts(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise PackageError("sourceRoot is not a safe relative path")
    path = PurePosixPath(value)
    if path.is_absolute():
        raise PackageError("sourceRoot is not a safe relative path")
    return path.parts


def validate_source_file(path):
    lowered = path.name.lower()
    if (
        lowered in DENIED_NAMES
        or lowered.startswith(".env.")
        or path.suffix.lower() in DENIED_SUFFIXES
        or any(part in DENIED_DIRECTORIES for part in path.parts)
    ):
        raise PackageError(f"Sensitive source files are not allowed: {path.name}")
    if path.is_symlink() or not path.is_file():
        raise PackageError(f"Runtime source is not a regular file: {path}")
    size = path.stat().st_size
    if size == 0:
        raise PackageError(f"Runtime source is empty: {path}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"sha256": digest, "size": size}


def validate_config(config):
    require_exact_fields(config, CONFIG_FIELDS, "Runtime config")
    if config["schemaVersion"] != 1:
        raise PackageError("Unsupported Runtime schema")
    for field in ("runtimeRevision", "sequence", "bootstrapApiVersion", "runtimeApiVersion"):
        require_positive_integer(config[field], field)
    if config["channel"] not in {"stable", "developer"}:
        raise PackageError("Runtime channel must be stable or developer")
    if not isinstance(config["baselineRange"], str) or not 1 <= len(config["baselineRange"]) <= 128:
        raise PackageError("baselineRange is not valid")
    lifetime = config["lifetimeDays"]
    if isinstance(lifetime, bool) or not isinstance(lifetime, int) or not 1 <= lifetime <= 30:
        raise PackageError("lifetimeDays must be a whole number from 1 to 30")
    source_root_parts(config["sourceRoot"])
    if not isinstance(config["entries"], list) or not config["entries"]:
        raise PackageError("Runtime entries must be a non-empty list")


def collect_files(config_path):
    config_path = Path(config_path).resolve()
    config = read_json(config_path)
    validate_config(config)
    root = config_path.parent.joinpath(*source_root_parts(config["sourceRoot"])).resolve()
    if not root.is_dir():
        raise PackageError("sourceRoot is not a directory")
    collected = {}
    total_size = 0
    for entry in config["entries"]:
        require_exact_fields(entry, {"source", "target"}, "Runtime entry")
        source_parts = safe_parts(entry["source"], "Runtime source")
        target_parts = validate_target(entry["target"])
        lexical_source = root.joinpath(*source_parts)
        current = root
        for part in source_parts:
            current = current / part
            if current.is_symlink():
                raise PackageError(f"Runtime source cannot use a symlink: {entry['source']}")
        source = lexical_source.resolve()
        try:
            source.relative_to(root)
        except ValueError as error:
            raise PackageError("Runtime source escapes sourceRoot") from error
        if source.is_file():
            sources = [(source, PurePosixPath(*target_parts))]
        elif source.is_dir():
            sources = []
            for candidate in sorted(source.rglob("*")):
                if candidate.is_symlink():
                    raise PackageError(f"Runtime source cannot contain a symlink: {candidate}")
                if candidate.is_file():
                    relative = candidate.relative_to(source)
                    target = PurePosixPath(*target_parts, *relative.parts)
                    validate_target(target.as_posix())
                    sources.append((candidate, target))
        else:
            raise PackageError(f"Runtime source does not exist: {entry['source']}")
        for source_file, target in sources:
            target_name = target.as_posix()
            if target_name in collected:
                raise PackageError(f"Duplicate Runtime target: {target_name}")
            metadata = validate_source_file(source_file)
            total_size += metadata["size"]
            if len(collected) >= MAX_FILES or total_size > MAX_RUNTIME_BYTES:
                raise PackageError("Runtime content exceeds the package limits")
            collected[target_name] = {"source": source_file, **metadata}
    if not collected:
        raise PackageError("Runtime package has no files")
    return config, dict(sorted(collected.items()))


def unsigned_manifest(config, files):
    return {
        "schemaVersion": config["schemaVersion"],
        "runtimeRevision": config["runtimeRevision"],
        "sequence": config["sequence"],
        "channel": config["channel"],
        "baselineRange": config["baselineRange"],
        "bootstrapApiVersion": config["bootstrapApiVersion"],
        "runtimeApiVersion": config["runtimeApiVersion"],
        "lifetimeDays": config["lifetimeDays"],
        "files": {
            target: {"sha256": value["sha256"], "size": value["size"]}
            for target, value in files.items()
        },
    }


def write_new(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as output:
            output.write(content)
    except FileExistsError as error:
        raise PackageError(f"Output already exists: {path}") from error


def prepare(config_path, output_path):
    config, files = collect_files(config_path)
    manifest = unsigned_manifest(config, files)
    write_new(output_path, json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return len(files)


def parse_timestamp(value, label):
    if not isinstance(value, str):
        raise PackageError(f"{label} is not valid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise PackageError(f"{label} is not valid") from error
    if parsed.tzinfo is None:
        raise PackageError(f"{label} must include a timezone")
    return parsed


def zip_info(name):
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    return info


def pack(config_path, manifest_path, output_path):
    config, files = collect_files(config_path)
    envelope_bytes = Path(manifest_path).read_bytes()
    try:
        envelope = json.loads(envelope_bytes)
    except json.JSONDecodeError as error:
        raise PackageError("Signed Runtime manifest is not valid JSON") from error
    require_exact_fields(envelope, {"keyId", "signed", "signature"}, "Signed Runtime envelope")
    require_exact_fields(envelope["signed"], SIGNED_FIELDS, "Signed Runtime manifest")
    expected = unsigned_manifest(config, files)
    expected.pop("lifetimeDays")
    signed_without_times = {
        key: value for key, value in envelope["signed"].items() if key not in {"issuedAt", "expiresAt"}
    }
    if signed_without_times != expected:
        raise PackageError("Signed Runtime manifest does not match the current sources and config")
    issued_at = parse_timestamp(envelope["signed"]["issuedAt"], "issuedAt")
    expires_at = parse_timestamp(envelope["signed"]["expiresAt"], "expiresAt")
    if expires_at - issued_at != timedelta(days=config["lifetimeDays"]):
        raise PackageError("Signed Runtime lifetime does not match the config")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        raise PackageError(f"Output already exists: {output_path}")
    try:
        with zipfile.ZipFile(output_path, "x", allowZip64=True, compresslevel=9) as archive:
            archive.writestr(zip_info("manifest.json"), envelope_bytes)
            for target, value in files.items():
                content = value["source"].read_bytes()
                if len(content) != value["size"] or hashlib.sha256(content).hexdigest() != value["sha256"]:
                    raise PackageError(f"Runtime source changed during packaging: {target}")
                archive.writestr(zip_info(target), content)
    except Exception:
        if output_path.exists():
            output_path.unlink()
        raise
    return len(files)


def main():
    parser = argparse.ArgumentParser(description="Prepare and package signed Panel Runtime updates")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare_parser = commands.add_parser("prepare")
    prepare_parser.add_argument("config")
    prepare_parser.add_argument("output")
    pack_parser = commands.add_parser("pack")
    pack_parser.add_argument("config")
    pack_parser.add_argument("manifest")
    pack_parser.add_argument("output")
    arguments = parser.parse_args()
    try:
        if arguments.command == "prepare":
            count = prepare(arguments.config, arguments.output)
            print(f"Prepared Runtime manifest draft with {count} files.")
        else:
            count = pack(arguments.config, arguments.manifest, arguments.output)
            print(f"Created signed Runtime package with {count} files.")
    except (OSError, PackageError, zipfile.BadZipFile) as error:
        print(f"runtime-package: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
