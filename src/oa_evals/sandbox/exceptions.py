from __future__ import annotations


class SandboxError(Exception):
    """Base exception for the sandbox module."""


class FileOperationError(SandboxError):
    """Raised when a file operation fails in the sandbox."""


class TerminalOperationError(SandboxError):
    """Raised when a terminal operation fails in the sandbox."""
