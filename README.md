<p align="center">
  <img src="docs/icon.png" width="96" alt="모타 앱 아이콘" />
</p>

<h1 align="center">Mota · 모타</h1>

<p align="center">
  지도에서 서울 버스 정류장과 지하철역을 경로로 저장하고<br />
  경로별 첫 버스 대기 시간을 비교하는 웹앱
</p>

> [!IMPORTANT]
> 모타는 설치 가능한 PWA입니다. 설치는 브라우저 주소창이나 메뉴에서만 제공합니다.
> 오프라인에서는 앱 셸과 저장한 경로를 복원하지만, 실시간 도착 정보와 새로운
> 정류장 검색에는 네트워크 연결이 필요합니다.

## 한눈에 보기

모타는 서울대중교통 좌표 기반 근접 정류소 응답과 서울 BIS 실시간 도착정보를
서버에서 정규화해 제공합니다. 브라우저에는 회사·집 등 이름 붙인 장소와 그에 속한
버스 정류장·지하철 경로점만 저장합니다. Hermes의 `/bus_company`, `/bus_home`
기능을 분리해 만든 프로젝트입니다.

| 기능 | 내용 |
|---|---|
| 지도 정류장 탐색 | 지도에서 `이 위치에서 찾기`로 근처 정류장 검색 후 선택 추가 |
| 정류장 정확 식별 | 이름, 5자리 ARS ID, 지도 방향 맥락으로 함께 구분 |
| 실시간 도착 비교 | 서울 BIS 노선별 첫 차 도착 예정을 경로 단위로 비교 |
| 출발 가이드 | 살아있는 첫 버스 대기 시간이 있을 때만 출발 시간 안내 |
| 장소·경로 저장 | 여러 장소에 버스 정류장과 지하철 경로점을 버전화 저장 |
| 지하철 경로점 | Overpass 기반 근처 역 검색으로 경로에 역 추가 |
| 오프라인 셸 | 서비스 워커로 동일 출처 앱 셸만 프리캐시 |

## 빠른 시작

### 1. 개발 실행

```bash
pnpm install
pnpm dev:api   # Bun API 서버 :3000
pnpm dev:web   # Vite 127.0.0.1:5173, /api 프록시
```

### 2. 프로덕션 실행

```bash
pnpm build
pnpm start
```

서버는 기본적으로 `0.0.0.0:3000`에 바인딩합니다. 로컬 전용 실행은
`HOST=127.0.0.1 pnpm start`를 사용하세요. 서울 교통 업스트림으로의 아웃바운드
접근이 필요합니다.

### 3. Docker

```bash
docker compose up -d --build
docker compose logs -f web
```

## 데이터와 개인정보

- 사용자 데이터는 브라우저 localStorage(`commute-bus-web:stops:v4`)에만
  저장합니다. 계정 가입과 서버 측 저장이 없습니다.
- 도착 스냅샷과 ETA는 저장하지 않습니다. 최신 스냅샷은 90초까지만 살아 있습니다.
- 정류장 검색·도착 조회 시 서버는 좌표와 정류장 ID를 서울 공공 API로만 중계합니다.
- 지하철 실시간 도착은 개인 프록시를 경유하며 `SUBWAY_ARRIVAL_UPSTREAM`으로
  교체할 수 있습니다.

## 아키텍처

```text
Browser (React 19 · Vite PWA)
    │  /api JSON — Zod 재검증
    ▼
Hono 서버 (Bun)
    │  업스트림 어댑터
    ├── 서울대중교통 좌표 기반 근접 정류소
    ├── 서울 BIS 정류소별 실시간 도착정보
    └── Overpass 지하철역 미러 레이스 · 지하철 도착 프록시
```

| 경로 | 역할 |
|---|---|
| `src/domain/` | 브라우저·서버 공유 커널: Zod 스키마, 추정기, 쿼리 도출 |
| `src/api/` | 브라우저 전송 경계와 `LiveArrivalsPort` 구현 |
| `src/hooks/` | 애플리케이션 계층: 상태 전이, 영속성, 읽기 쿼리 |
| `src/components/` | UI, Leaflet 지도, 정류장 선택기 |
| `server/` | Hono 라우팅과 서울 업스트림 어댑터 |
| `public/` | PWA 매니페스트, 서비스 워커, 아이콘 |
| `ARCHITECTURE.md` | 계층 규칙 규범 |
| `DESIGN.md` | 레이아웃·접근성 규범 |

## 개발 명령

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

## 데이터 출처

- 서울대중교통 좌표 기반 근접 정류소
- 서울 BIS 정류소별 실시간 도착정보
- OpenStreetMap 지도 타일

공공 엔드포인트의 응답 스키마가 변경되면 서버 어댑터 테스트를 먼저 갱신하세요.
