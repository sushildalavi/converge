# ReplayForge

Async workflow replay & failure debugging platform. Ingests workflow events, processes them through Redis Streams workers with retries and dead-letter queues, and provides a dashboard for inspecting workflow timelines and replaying failed events.

WIP — see plan doc for milestones.

## Quickstart

```bash
docker compose up -d postgres redis
```

More to come.
