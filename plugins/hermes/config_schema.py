"""Hermes dashboard configuration declaration for the b1ack-dream provider.

This module intentionally imports only Hermes' declarative schema types.  The
dashboard loads it by file path before it imports the provider runtime.
"""

from plugins.memory.config_schema import (
    KIND_BOOL,
    KIND_NUMBER,
    KIND_SELECT,
    ProviderConfigSchema,
    ProviderField,
    ProviderFieldOption,
)


CONFIG_SCHEMA = ProviderConfigSchema(
    name="b1ack-dream",
    label="Hermes B1ack Dream",
    docs_url="https://github.com/B1ackHand666/hermes-b1ack-dream",
    fields=(
        ProviderField(
            key="memory_style",
            label="Memory style",
            kind=KIND_SELECT,
            default="balanced",
            description="Controls how cautiously candidates are promoted and recalled.",
            options=(
                ProviderFieldOption("conservative", "Conservative"),
                ProviderFieldOption("balanced", "Balanced"),
                ProviderFieldOption("active", "Active"),
            ),
            inline=True,
        ),
        ProviderField(
            key="automatic_dream",
            label="Automatic Dream",
            kind=KIND_BOOL,
            default="true",
            description="Consolidate completed primary sessions automatically.",
            inline=True,
        ),
        ProviderField(
            key="scheduled_dream_hours",
            label="Scheduled Dream interval (hours)",
            kind=KIND_NUMBER,
            default="24",
            description="0 disables scheduled consolidation; a running provider uses this real timer even without a new user turn.",
            group="Advanced",
        ),
        ProviderField(
            key="webui_enabled",
            label="Enable standalone local WebUI fallback",
            kind=KIND_BOOL,
            default="true",
            description="Disables only the standalone HTML fallback; Hermes Dashboard management remains available through its authenticated plugin API.",
            inline=True,
        ),
        ProviderField(
            key="webui_port",
            label="Local WebUI port",
            kind=KIND_NUMBER,
            default="0",
            description="0 selects an available localhost port.",
            group="Advanced",
        ),
        ProviderField(
            key="enable_native_memory_editor",
            label="Enable USER.md / MEMORY.md editor",
            kind=KIND_BOOL,
            default="false",
            description="Enables only explicit WebUI edits; no automatic synchronisation is ever performed.",
            group="Advanced",
        ),
    ),
)
