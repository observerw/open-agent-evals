from __future__ import annotations

import sys

from loguru import logger


def setup_logging(level: str = "INFO") -> None:
    """
    Configures loguru for the oa_evals library.

    This function enables "oa_evals" logs and sets up a standard format
    that includes the bound `benchmark_id` and `task_id`.
    """
    logger.remove()

    fmt = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{extra[benchmark_id]}</cyan>:<cyan>{extra[task_id]}</cyan> - "
        "<level>{message}</level>"
    )

    logger.add(sys.stderr, format=fmt, level=level)
    logger.enable("oa_evals")
