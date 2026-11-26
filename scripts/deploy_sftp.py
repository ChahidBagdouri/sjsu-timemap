"""Deploy static output into the TimeMap directory only. Dry-run unless --execute."""

from __future__ import annotations
import argparse
from datetime import datetime, timezone
import io
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import uuid

APP = "sjsu-timemap"
DATASET = re.compile(r"(?:spring|summer|fall|winter)-20\d{2}-[0-9a-f]{12}\.json")


def validate_destination(value: str) -> str:
    value = value.rstrip("/")
    path = PurePosixPath(value)
    if (
        not value.startswith("/")
        or "\\" in value
        or any(x in {".", ".."} for x in value.split("/"))
    ):
        raise ValueError(
            "The destination must be an absolute POSIX path without traversal"
        )
    if path.name != APP or len(path.parts) < 4 or str(path) != value:
        raise ValueError(
            "Destination must be an app-only directory ending in /sjsu-timemap"
        )
    return value


def build_files(root: Path) -> list[Path]:
    if (
        not (root / "index.html").is_file()
        or not (root / "data/manifest.json").is_file()
    ):
        raise ValueError("Build is missing index.html or data/manifest.json")
    files = sorted(p for p in root.rglob("*") if p.is_file())
    if any(
        p.is_symlink() or any(x.startswith(".") for x in p.relative_to(root).parts)
        for p in files
    ):
        raise ValueError("Hidden files and symlinks are not deployable")
    # Publish manifest then HTML only after all versioned dependencies exist.
    return sorted(
        files,
        key=lambda p: (
            (
                2
                if p.relative_to(root).as_posix() == "index.html"
                else 1 if p.relative_to(root).as_posix() == "data/manifest.json" else 0
            ),
            str(p),
        ),
    )


def connect():
    import paramiko

    host, user = os.environ["SFTP_HOST"], os.environ["SFTP_USER"]
    known_hosts = os.environ["SFTP_KNOWN_HOSTS"]
    client = paramiko.SSHClient()
    # Pinned host keys are mandatory. Never accept arbitrary server keys.
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", delete=False
    ) as handle:
        handle.write(known_hosts + "\n")
        filename = handle.name
    try:
        client.load_host_keys(filename)
    finally:
        Path(filename).unlink()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    key_text = os.environ.get("SFTP_PRIVATE_KEY", "")
    key = None
    if key_text:
        for key_type in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
            try:
                key = key_type.from_private_key(
                    io.StringIO(key_text),
                    password=os.environ.get("SFTP_KEY_PASSPHRASE") or None,
                )
                break
            except (paramiko.SSHException, ValueError):
                continue
        if key is None:
            raise ValueError("Unsupported or encrypted deployment key")
    password = os.environ.get("SFTP_PASSWORD") or None
    if key is None and password is None:
        raise ValueError(
            "Configure a deployment key or SFTP password/token in GitHub secrets"
        )
    client.connect(
        hostname=host,
        port=int(os.environ.get("SFTP_PORT", "22")),
        username=user,
        pkey=key,
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    return client


def deploy(root: Path, destination: str, execute: bool) -> None:
    destination = validate_destination(destination)
    files = build_files(root)
    if not execute:
        print(
            f"Dry run: {len(files)} static files would be uploaded into {destination}/"
        )
        return
    client = connect()
    try:
        with client.open_sftp() as sftp:
            try:
                info = sftp.lstat(destination)
                if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                    raise ValueError(
                        "The app destination must be a directory, not a symlink"
                    )
            except FileNotFoundError:
                sftp.stat(str(PurePosixPath(destination).parent))
                sftp.mkdir(destination)
            canonical = sftp.normalize(destination)
            validate_destination(canonical)
            for path in files:
                relative = path.relative_to(root).as_posix()
                remote = str(PurePosixPath(canonical) / relative)
                parent = PurePosixPath(remote).parent
                chain = []
                while str(parent) != canonical:
                    chain.append(str(parent))
                    parent = parent.parent
                for directory in reversed(chain):
                    try:
                        info = sftp.lstat(directory)
                        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
                            raise ValueError(
                                "Refusing a non-directory inside the app destination"
                            )
                    except FileNotFoundError:
                        sftp.mkdir(directory)
                temporary = remote + ".upload-" + uuid.uuid4().hex
                try:
                    sftp.put(str(path), temporary)
                    # Requires the OpenSSH atomic-rename extension. Fail safely if unsupported.
                    sftp.posix_rename(temporary, remote)
                except Exception:
                    try:
                        sftp.remove(temporary)
                    except OSError:
                        pass
                    raise
            # Prune only our versioned datasets, inside the verified app directory.
            data_dir = str(PurePosixPath(canonical) / "data")
            entries = [
                e
                for e in sftp.listdir_attr(data_dir)
                if DATASET.fullmatch(e.filename) and stat.S_ISREG(e.st_mode)
            ]
            keep = {p.name for p in files if p.parent.name == "data"}
            by_term = {}
            for entry in entries:
                term = entry.filename.rsplit("-", 1)[0]
                by_term.setdefault(term, []).append(entry)
            for values in by_term.values():
                keep.update(
                    e.filename
                    for e in sorted(values, key=lambda e: e.st_mtime, reverse=True)[:2]
                )
            cutoff = datetime.now(timezone.utc).timestamp() - 14 * 86400
            removed = 0
            for entry in entries:
                if entry.filename not in keep and entry.st_mtime < cutoff:
                    sftp.remove(str(PurePosixPath(data_dir) / entry.filename))
                    removed += 1
            print(
                f"Published {len(files)} static files; removed {removed} expired app datasets"
            )
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=Path("dist"))
    parser.add_argument("--remote-dir", default=os.environ.get("SFTP_REMOTE_DIR", ""))
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    deploy(args.dist.resolve(), args.remote_dir, args.execute)
