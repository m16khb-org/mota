---
name: 2026-09-05-scope-subway-positions-by-station-and-route
description: Caution record for a solved false case or recurring risk.
---

# Scope subway positions by station and route

- Date: 2026-09-05
- Kind: `caution`
- Source: Codex live container diagnosis
- Summary: 서울 지도 경계 밖 역이나 동명이역을 이름만으로 처리하면 전체 실시간 열차가 사라지거나 잘못된 노선 좌표에 배치된다.
- Context: 실제 컨테이너에서 공식 API는 1호선 73건을 정상 반환했지만 liveTransit.subway는 8회 연속 unavailable이었다. 지도 생성물은 서울 bbox로 잘려 있고, 대림처럼 같은 이름의 역이 서로 다른 노선 좌표에 존재한다.
- Resolution: 유효한 상류 행을 먼저 Zod로 검증한 뒤 생성 지도에 없는 경계 밖 역은 제외한다. 좌표 인덱스는 정규화 역명 단독이 아니라 정규화 역명과 정규화 노선 ID의 복합 키를 사용한다. 상류 형식 오류는 계속 전체 폴 실패로 처리한다.
- Evidence:
  - apps/api/src/upstream/subwayPositions.ts
  - apps/api/src/upstream/subwayPositions.test.ts
  - 실제 SSE 스모크: subway live, 349대 후 347대 완전 스냅샷
  - 실제 health: successCount 2, failureCount 0
