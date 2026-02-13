from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterable
from functools import partial

import anyio
import loguru
from acp_agent import ACPAgent
from attrs import define, field
from loguru import logger

from oa_evals.acp import SessionUpdate, Trajectory, TrajectoryBuilder, TrajectoryData
from oa_evals.acp.client import ReadonlyACPClient
from oa_evals.grader import GraderContext
from oa_evals.grader.abc import GraderProtocol
from oa_evals.grader.model import OutcomeData, OutcomeValue
from oa_evals.grader.schema import GraderRegistry
from oa_evals.sandbox import SandboxBuilder

from .abc import Trail
from .model import TrailResult


@define
class TrailRunner:
    agent: ACPAgent
    sandbox_builder: SandboxBuilder

    concurrent_grade: bool

    trail: Trail
    graders: GraderRegistry

    _logger: loguru.Logger = field(init=False)
    _builder: TrajectoryBuilder = field(init=False, factory=TrajectoryBuilder)
    _stream: AsyncIterable[SessionUpdate] = field(init=False)

    def __attrs_post_init__(self) -> None:
        self._logger = logger.bind(
            task_id=self.trail.task.metadata.id,
            trail_idx=self.trail.idx,
        )

    async def run(self) -> TrailResult:
        task = self.trail.task

        # build sandbox from task-specific containerfile
        containerfile = await self.trail.format_containerfile(self.agent)
        print(containerfile)
        sandbox = await self.sandbox_builder.build(
            containerfile=containerfile,
            tag=f"{task.metadata.id}_{self.trail.idx}",
            context=task.root_path,
        )

        async with sandbox.run():
            # copy config and credential files into sandbox if specified
            async with anyio.create_task_group() as tg:
                if local_path := self.agent.config_path:
                    container_path = self.agent.config.config
                    tg.start_soon(
                        partial(
                            sandbox.upload_file,
                            local_path=local_path,
                            container_path=container_path,
                        )
                    )
                if (
                    (local_path := self.agent.credential_path)  #
                    and (container_path := self.agent.config.credential)
                ):
                    tg.start_soon(
                        partial(
                            sandbox.upload_file,
                            local_path=local_path,
                            container_path=container_path,
                        )
                    )

            client = ReadonlyACPClient()
            cmd = self.agent.format_command()
            # start acp agent process in the sandbox
            conn = await sandbox.acp(
                client,
                *cmd,
                cwd=task.container_workdir,
                env=task.container_env,
            )

            resp = await conn.new_session(
                cwd=task.container_workdir.as_posix(),
                mcp_servers=[],
            )
            session_id = resp.session_id

            self._stream = client.stream_update(session_id=session_id)

            while prompt := await task.invoke_prompt(self.build_trajectory()):
                resp = await conn.prompt(prompt=prompt, session_id=session_id)
                stop_reason = resp.stop_reason
                logger.debug(f"Received response with stop reason: {stop_reason}")

            traj = self.build_trajectory()
            grade_ctx = GraderContext(task, traj, sandbox)
            outcomes: dict[str, OutcomeData] = {}

            async def run_grader(grader_id: str, grader: GraderProtocol) -> None:
                raw = await grader(grade_ctx)
                outcomes[grader_id] = OutcomeValue.ensure(raw)

            if self.concurrent_grade:
                async with anyio.create_task_group() as tg:
                    for grader_id, grader in self.graders.items():
                        tg.start_soon(run_grader, grader_id, grader)
            else:
                for grader_id, grader in self.graders.items():
                    await run_grader(grader_id, grader)

            traj_data = self.build_trajectory_data()
            return TrailResult(traj=traj_data, outcomes=outcomes)

    async def stream_trajectory(self) -> AsyncGenerator[Trajectory]:
        async for update in self._stream:
            self._builder.append(update)
            yield self._builder.build()

    def build_trajectory(self) -> Trajectory:
        return self._builder.build()

    def build_trajectory_data(self) -> TrajectoryData:
        return self._builder.build_data()
