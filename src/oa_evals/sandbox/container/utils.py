from __future__ import annotations

import shutil
import subprocess
from collections.abc import AsyncGenerator, Mapping, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, NamedTuple

import anyio
from anyio.abc import AnyByteReceiveStream, AnyByteSendStream
from attrs import define
from loguru import logger

from oa_evals.sandbox.exceptions import SandboxError
from oa_evals.utils.process import ProcessResult, run_process

from ..schema import BuildArgs


@define
class MountBase:
    type: str
    target: str
    source: str | None = None
    readonly: bool = False

    def _get_parts(self) -> tuple[str, ...]:
        parts = [f"type={self.type}"]
        if self.source:
            parts.append(f"source={self.source}")
        parts.append(f"target={self.target}")
        if self.readonly:
            parts.append("readonly")
        return tuple(parts)

    def __str__(self) -> str:
        return ",".join(self._get_parts())


@define
class BindMount(MountBase):
    type: str = "bind"
    bind_propagation: (
        Literal["private", "rprivate", "shared", "rshared", "slave", "rslave"] | None
    ) = None

    def _get_parts(self) -> tuple[str, ...]:
        parts = list(super()._get_parts())
        if self.bind_propagation:
            parts.append(f"bind-propagation={self.bind_propagation}")
        return tuple(parts)

    @classmethod
    def from_path(
        cls, path: Path, *, readonly: bool = False, target: str | None = None
    ) -> BindMount:
        abs_path = path.resolve()
        source = str(abs_path)
        target = target or abs_path.as_posix()
        return cls(source=source, target=target, readonly=readonly)


@define
class VolumeMount(MountBase):
    type: str = "volume"
    volume_driver: str | None = None
    volume_subpath: str | None = None
    volume_nocopy: bool = False
    volume_opt: tuple[str, ...] | None = None

    def _get_parts(self) -> tuple[str, ...]:
        parts = list(super()._get_parts())
        if self.volume_driver:
            parts.append(f"volume-driver={self.volume_driver}")
        if self.volume_subpath:
            parts.append(f"volume-subpath={self.volume_subpath}")
        if self.volume_nocopy:
            parts.append("volume-nocopy")
        if self.volume_opt:
            parts.extend(f"volume-opt={opt}" for opt in self.volume_opt)
        return tuple(parts)


@define
class TmpfsMount(MountBase):
    type: str = "tmpfs"
    tmpfs_size: int | None = None
    tmpfs_mode: int | None = None

    def _get_parts(self) -> tuple[str, ...]:
        parts = list(super()._get_parts())
        if self.tmpfs_size is not None:
            parts.append(f"tmpfs-size={self.tmpfs_size}")
        if self.tmpfs_mode is not None:
            parts.append(f"tmpfs-mode={oct(self.tmpfs_mode)}")
        return tuple(parts)


type MountPoint = BindMount | VolumeMount | TmpfsMount
type Mount = MountPoint | str | Path


def build_run_command(
    image: str,
    *,
    name: str | None = None,
    mounts: Sequence[Mount] | None = None,
    command: Sequence[str] | None = None,
    entrypoint: str | None = None,
    env: Mapping[str, str] | None = None,
    workdir: str | None = None,
    user: str | None = None,
    detach: bool = False,
    rm: bool = True,
    network: str | None = None,
) -> list[str]:
    backend = get_backend()
    cmd = [backend, "run"]
    if rm:
        cmd.append("--rm")
    if detach:
        cmd.append("-d")
    else:
        cmd.append("-i")
    if name:
        cmd.extend(["--name", name])
    if workdir:
        cmd.extend(["--workdir", workdir])
    if user:
        cmd.extend(["--user", user])
    if network:
        cmd.extend(["--network", network])

    if mounts:
        for m in mounts:
            cmd.extend(["--mount", _format_mount(m)])

    if env:
        for k, v in env.items():
            cmd.extend(["-e", f"{k}={v}"])

    if entrypoint:
        cmd.extend(["--entrypoint", entrypoint])

    cmd.append(image)
    if command:
        cmd.extend(command)

    return cmd


def build_exec_command(
    container: str,
    *command: str,
    env: Mapping[str, str] | None = None,
    user: str | None = None,
    workdir: str | None = None,
    interactive: bool = False,
) -> list[str]:
    backend = get_backend()
    cmd = [backend, "exec"]
    if interactive:
        cmd.append("-i")
    if user:
        cmd.extend(["--user", user])
    if workdir:
        cmd.extend(["--workdir", workdir])
    if env:
        for k, v in env.items():
            cmd.extend(["-e", f"{k}={v}"])
    cmd.append(container)
    cmd.extend(command)
    return cmd


def _format_mount(mount: Mount) -> str:
    if isinstance(mount, Path):
        return str(BindMount.from_path(mount))
    return str(mount)


def get_backend() -> str:
    """Detect available docker-compatible backend."""
    for backend in ("docker", "podman", "nerdctl"):
        if shutil.which(backend):
            return backend
    raise RuntimeError("No docker-compatible backend found (docker, podman, nerdctl)")


async def build_image(
    containerfile: str,
    *,
    context: Path | None = None,
    tag: str | None = None,
    build_args: BuildArgs | None = None,
) -> str:
    backend = get_backend()

    cmd = [backend, "build"]
    if tag:
        cmd.extend(["-t", tag])
    else:
        cmd.append("--quiet")

    if build_args:
        for k, v in build_args.items():
            cmd.extend(["--build-arg", f"{k}={v}"])

    if context:
        cmd.extend(["-f", "-", str(context.resolve())])
    else:
        cmd.append("-")

    logger.debug("Building image: {}", " ".join(cmd))
    result = await run_process(*cmd, input=containerfile, check=False)
    if result.returncode != 0:
        raise SandboxError(f"Build failed: {result.stderr or result.stdout}")

    return tag or result.stdout.strip()


async def rm_image(image: str) -> None:
    backend = get_backend()
    await run_process(backend, "rmi", "-f", image, check=False)


async def start_container(
    image: str,
    *,
    name: str | None = None,
    mounts: Sequence[Mount] | None = None,
    command: Sequence[str] | None = None,
    entrypoint: str | None = None,
    env: Mapping[str, str] | None = None,
    workdir: str | None = None,
    user: str | None = None,
    rm: bool = True,
    network: str | None = None,
) -> None:
    cmd = build_run_command(
        image,
        name=name,
        mounts=mounts,
        command=command,
        entrypoint=entrypoint,
        env=env,
        workdir=workdir,
        user=user,
        detach=True,
        rm=rm,
        network=network,
    )

    logger.debug("Starting container: {}", " ".join(cmd))
    result = await run_process(*cmd, check=False)
    if result.returncode != 0:
        raise SandboxError(
            f"Failed to start container: {result.stderr or result.stdout}"
        )


class ContainerStdio(NamedTuple):
    stdin: AnyByteSendStream
    stdout: AnyByteReceiveStream
    stderr: AnyByteReceiveStream


@asynccontextmanager
async def run_container(
    image: str,
    *,
    name: str | None = None,
    mounts: Sequence[Mount] | None = None,
    command: Sequence[str] | None = None,
    entrypoint: str | None = None,
    env: Mapping[str, str] | None = None,
    workdir: str | None = None,
    user: str | None = None,
    detach: bool = False,
    rm: bool = True,
    network: str | None = None,
) -> AsyncGenerator[ContainerStdio, None]:
    cmd = build_run_command(
        image,
        name=name,
        mounts=mounts,
        command=command,
        entrypoint=entrypoint,
        env=env,
        workdir=workdir,
        user=user,
        detach=detach,
        rm=rm,
        network=network,
    )

    logger.debug("Running container: {}", " ".join(cmd))

    async with await anyio.open_process(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as process:
        stdin = process.stdin
        stdout = process.stdout
        stderr = process.stderr

        if stdin is None or stdout is None or stderr is None:
            msg = "Failed to open process streams"
            raise RuntimeError(msg)

        yield ContainerStdio(stdin, stdout, stderr)


async def stop_container(container: str) -> None:
    backend = get_backend()
    await run_process(backend, "stop", container, check=False)


async def rm_container(container: str) -> None:
    backend = get_backend()
    await run_process(backend, "rm", "-f", container, check=False)


async def exec_container(
    container: str,
    *command: str,
    env: Mapping[str, str] | None = None,
    user: str | None = None,
    workdir: str | None = None,
    input: str | None = None,
    check: bool = True,
) -> ProcessResult:
    cmd = build_exec_command(
        container,
        *command,
        env=env,
        user=user,
        workdir=workdir,
        interactive=input is not None,
    )

    logger.debug("Executing in container {}: {}", container, " ".join(command))
    return await run_process(*cmd, input=input, check=check)


async def upload_to_container(
    container: str, local_path: Path, remote_path: Path
) -> None:
    backend = get_backend()
    # Ensure remote directory exists
    await exec_container(container, "mkdir", "-p", str(remote_path.parent))
    await run_process(backend, "cp", str(local_path), f"{container}:{remote_path}")


async def download_from_container(
    container: str, remote_path: Path, local_path: Path
) -> None:
    backend = get_backend()
    # Ensure local directory exists
    local_path.parent.mkdir(parents=True, exist_ok=True)
    await run_process(backend, "cp", f"{container}:{remote_path}", str(local_path))
