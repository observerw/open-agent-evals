from __future__ import annotations

from typing import Protocol

from acp import helpers
from acp import schema as acp_schema

from .schema import Trajectory

type PromptBlock = (
    acp_schema.TextContentBlock
    | acp_schema.ImageContentBlock
    | acp_schema.AudioContentBlock
    | acp_schema.ResourceContentBlock
    | acp_schema.EmbeddedResourceContentBlock
)

# blob
audio = helpers.audio_block
image = helpers.image_block
# resource
blob = helpers.embedded_blob_resource
text_resource = helpers.embedded_text_resource
resource = helpers.resource_block
link = helpers.resource_link_block
# text
text = helpers.text_block


class PromptGeneratorProtocol(Protocol):
    async def __call__(self, traj: Trajectory | None) -> list[PromptBlock]: ...
