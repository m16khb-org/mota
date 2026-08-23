# ARCHITECTURE

## 제품 경계

모타의 활성 제품 경로는 하나다.

```text
정류장 또는 역 선택
  → 선택 저장
  → 해당 지점 도착 조회
  → 버스 최대 3행 또는 지하철 방향별 최대 3행 표시
```

회사·집, 이름 있는 장소, 통근 절차, 즐겨찾기, 출발 시각, 여정 ETA는
활성 제품 모델이 아니다. 기존 v4 저장 데이터는 정류장과 역만 새 저장소로
가져오기 위해 읽으며, 절차·장소·즐겨찾기 데이터는 새 저장소에 쓰지 않는다.

## 레이어

| 레이어 | 위치 | 책임 |
|---|---|---|
| 도메인 | `src/domain/bus.ts`, `src/domain/subway.ts` | 정류장·역·도착 스키마, 서울 API 정규화와 정렬 |
| 애플리케이션 | `src/hooks/useTransitSelections.ts`, `src/hooks/useArrivalDetail.ts` | 선택 상태 변경, 선택 지점의 도착 조회와 재시도 |
| 브라우저 어댑터 | `src/api/client.ts`, `src/hooks/transitSelectionStorage.ts` | HTTP와 localStorage 경계의 Zod 파싱, v4 지점 마이그레이션 |
| 프레젠테이션 | `src/App.tsx`, `src/components/` | 교통수단·지점·방향 선택, 최대 3건 표시, 지도와 반응형 셸 |
| 서버 라우트 | `server/app.ts` | 요청 파싱, upstream 호출, 고정 오류 형태 매핑 |
| 서버 upstream | `server/upstream/seoulBus.ts`, `overpassStations.ts`, `subwayArrivals.ts` | 서울 버스·OSM·지하철 응답 정규화 |

의존성은 다음 방향만 허용한다.

```text
presentation → application → domain
                     ↓
                  adapters

server routes → server upstream → shared domain schemas
```

`src/domain/**`는 React, 브라우저 API, hooks, components, server를 import하지 않는다.

## 브라우저 조합

`src/App.tsx`가 조합 루트다.

1. `useTransitSelections`가 저장한 정류장, 역과 각각의 최근 선택 ID를 제공한다.
2. `TransitPointSelector`가 버스·지하철 탭과 지점 목록을 렌더링한다.
3. 현재 교통수단에 해당하는 선택만 `useArrivalDetail`에 전달한다.
4. `useArrivalDetail`은 버스 또는 지하철 endpoint 하나만 호출한다.
5. 버스는 `ArrivalList`, 지하철은 `SubwayArrivalList`가 표시를 담당한다.
6. `MapStage`는 저장 지점과 현재 선택을 지도에 투영할 뿐 검색이나 저장을 소유하지 않는다.
7. 검색과 저장은 `MapPicker`와 `SubwayPicker`의 명시적 행동으로만 발생한다.

교통수단 전환은 저장을 삭제하지 않는다. 버스와 지하철의 최근 선택 ID는
각각 독립적으로 유지된다.

## 저장소

활성 키는 `mota:transit-selections:v1`이다.

```ts
interface TransitSelections {
  readonly busStops: readonly BusStop[];
  readonly subwayStations: readonly SubwayStation[];
  readonly selectedBusStopId: StopId | null;
  readonly selectedSubwayStationId: SubwayStationId | null;
}
```

`transitSelectionStorage.ts`만 이 키를 읽고 쓴다.

- 모든 값을 Zod로 파싱한다.
- ID가 중복된 지점은 마지막 값을 사용한다.
- 존재하지 않는 선택 ID는 첫 지점 또는 `null`로 복구한다.
- 새 키가 없으면 `commute-bus-web:stops:v4`에서 모든 회사·집 장소의 정류장과
  역만 평탄화하고 중복을 제거한다.
- v4의 절차, 즐겨찾기, 출발지와 장소 이름은 마이그레이션하지 않는다.

## 도착 조회

### 버스

- 브라우저는 선택 정류장의 5자리 ARS ID로 `/api/arrivals/:arsId`를 호출한다.
- 서버는 서울 버스 응답을 `BusArrival[]`로 정규화하고 첫 ETA로 정렬한다.
- 한 노선은 upstream 계약상 `first`와 선택적인 `second` 예측을 가진다.
- 화면은 정렬된 노선 행 중 최대 세 행만 렌더링한다.

### 지하철

- 브라우저는 선택 역명으로 `/api/subway/arrivals?station=...`을 호출한다.
- 서버는 도착 열차 배열을 초 단위 ETA로 정렬한다.
- 화면은 관찰된 `subwayId + updnLine`을 방향 탭으로 만든다.
- 선택한 방향의 열차만 필터링한 뒤 최대 세 행을 렌더링한다.

표시 제한은 프레젠테이션 경계에만 적용한다. 어댑터와 도메인 정규화는
전체 응답을 유지해야 한다.

## 오류와 동시성

`useArrivalDetail`은 버스와 지하철 요청 시퀀스를 각각 관리한다.

- 지점을 바꾸면 이전 응답은 최신 상태를 덮어쓰지 못한다.
- 새 요청 중에는 선택과 이전 성공 행을 유지한다.
- 실패하면 선택을 지우지 않고 짧은 사용자 오류와 `다시 시도`를 제공한다.
- 교통수단을 바꾸면 비활성 교통수단의 표시 상태를 비운다.

브라우저와 서버 네트워크 경계는 기존 8초 timeout 계약을 유지한다.

## 반응형 셸

- 데스크톱: 420px 제어 레일과 나머지 지도 영역의 `100dvh` 2열 셸이다.
- 모바일·태블릿: 위쪽 30dvh 지도와 아래 내부 스크롤 시트다.
- `.rail-scroll`만 제어 영역의 세로 스크롤을 소유한다.
- 문서와 지도는 제어 레일 스크롤에 따라 움직이지 않는다.
- 지도 선택과 목록 선택은 같은 저장 ID를 사용한다.

세부 시각·접근성 계약은 `DESIGN.md`가 소유한다.

## 경계 규칙

- 정류장명만으로 정체성을 판단하지 않는다. `StopId`와 5자리 `ArsId`를 보존한다.
- 역명만으로 저장 정체성을 판단하지 않는다. OSM 기반 `SubwayStationId`를 보존한다.
- 지하철 방향은 표시 문자열이 아니라 `subwayId + updnLine`으로 그룹화한다.
- 외부 JSON과 localStorage는 반드시 Zod로 파싱한다.
- 지도 이동만으로 주변 검색을 시작하지 않는다.
- 선택 저장과 지도 검색을 도착 조회 hook 안에 넣지 않는다.
- 도메인에 React, fetch, localStorage를 넣지 않는다.

## 퇴역 코드

이전 절차 제품을 구현하던 `commute*`, `autoCommute*`, `FavoriteDepartures`,
procedure editor와 live-query 모듈은 활성 조합 루트에서 참조하지 않는다.
새 기능은 이 모듈을 다시 연결하거나 확장하지 않는다. 기존 저장 데이터 읽기 외에는
활성 제품 경로와 분리된 호환 기록으로 취급한다.
