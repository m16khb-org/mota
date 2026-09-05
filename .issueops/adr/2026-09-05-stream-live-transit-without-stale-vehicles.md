---
name: 2026-09-05-stream-live-transit-without-stale-vehicles
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Stream live transit without stale vehicles

- Date: 2026-09-05
- Kind: `adr`
- Source: Codex implementation of docs/superpowers/plans/2026-09-05-live-transit-3d-map.md
- Summary: 3D 지도 실시간 차량을 서버 공유 수집기와 SSE로 전달하고 장애 시 오래된 차량을 즉시 제거한다.
- Context: 브라우저별 공식 API 폴링은 키 노출·중복 부하·불일치 상태를 만들며, 직전 차량을 유지하면 실제 운행으로 오인될 수 있다.
- Decision: 단일 Nest 프로세스에서 지하철 10초 공유 수집기와 노선별 버스 15초 참조 계수 수집기를 운영한다. 브라우저는 정적 네트워크를 REST로 받고 완전한 차량 스냅샷과 가용성·heartbeat를 SSE로 받는다. 한 소스 실패 시 해당 차량을, SSE 오류 시 모든 차량을 즉시 비운다.
- Consequences: 현재 구조는 단일 프로세스 안에서만 수집을 공유한다. 다중 replica가 필요해지면 분산 수집·브로커를 별도 결정해야 한다. 실시간 소스 상태는 liveness를 실패시키지 않고 /api/health.liveTransit 지표로 관찰한다.
- Evidence:
  - apps/api/src/transit-map/subwayPositionCollector.ts
  - apps/api/src/transit-map/busPositionCollectorRegistry.ts
  - apps/api/src/transit-map/transitMapStream.service.ts
  - apps/web/src/components/map-preview/useLiveTransitMap.ts
  - PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web test:e2e (13 passed)
- Alternatives / rejected options:
  - 브라우저가 서울 공식 API를 직접 호출한다 — 비밀키 노출과 브라우저별 중복 폴링 때문에 거절했다.
  - 마지막 성공 차량을 장애 중에도 유지한다 — 오래된 위치를 실시간으로 오인시키므로 거절했다.
  - 각 SSE 연결마다 독립 수집기를 만든다 — 연결 수만큼 상류 부하가 늘어 거절했다.
