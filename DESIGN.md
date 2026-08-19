# 곧 도착 Design System

## Product brief

`곧 도착`은 출근 직전 또는 퇴근 직전, 사용자가 지도에서 정확한 서울 버스 정류장과
지하철역을 경로로 고르고 가장 먼저 오는 버스를 확인하는 웹앱이다. 여러 회사와 집을
이름으로 구분하고 각 장소에 여러 경로 지점을 저장하며, `회사로`(집 → 회사)와
`집으로`(회사 → 집)을 화면의 두 방향으로 보존한다.

### Primary persona

- 서울에서 버스로 출퇴근하며 정류장 이름이 비슷해 반대편 정류장을 자주 혼동하는 사람
- 이동 중 한 손과 짧은 주의 시간으로 사용한다.
- 가장 중요한 질문은 “어느 정류장에서 어떤 버스가 몇 분 뒤 오는가?”이다.

### Success criteria

1. 첫 사용자가 30초 안에 지도에서 버스 정류장이나 지하철역을 장소별로 저장한다.
2. 사용자는 회사와 집을 각각 제한 없이 만들고 각 장소에 여러 경로 지점을 저장한다.
3. 지도 마커를 여러 개 선택해 한 번에 경로에 추가한다.
4. 재방문 사용자는 장소와 버스 정류장을 한 번의 탭으로 전환하고 도착정보를 새로고침한다.
5. 정류장명, ARS 번호, 역명, 지도 위치를 함께 보여 잘못된 지점 선택을 줄인다.
6. 사용자는 브라우저의 설치 표면에서 앱을 설치하고 오프라인에서도 저장한 화면을 다시 연다.

## Visual direction

**Urban utility.** Uber의 대담한 도시형 흑백 대비와 대중교통 전광판의 즉시성을 결합한다.
장식보다 정보 우선이며, 지도와 ETA 숫자가 시각적 주인공이다. 그라디언트, 유리 효과,
과도한 둥근 카드, 장식용 일러스트를 사용하지 않는다.

## Tokens

### Color

| Token | Value | Use |
|---|---:|---|
| `--ink` | `#0b0b0b` | Primary text, active controls |
| `--paper` | `#f7f7f3` | App background |
| `--surface` | `#ffffff` | Panels and cards |
| `--line` | `#d9d9d2` | Borders and separators |
| `--muted` | `#62625d` | Secondary text |
| `--signal` | `#c7f000` | Active commute direction, selected stop |
| `--signal-ink` | `#182000` | Text on signal |
| `--route-blue` | `#155eef` | Route identity and map focus |
| `--danger` | `#c81e1e` | Errors only |

Color never carries state alone. Active tabs use color, weight, and shape; errors include icon and text.

### Type

- Family: `"Pretendard Variable", Pretendard, Inter, system-ui, sans-serif`
- Display: `clamp(2rem, 4vw, 4.5rem)`, weight 750, tight tracking
- Section title: `1.125rem`, weight 700
- Body: `0.9375rem`, weight 450, line-height 1.55
- ETA: tabular numerals, `clamp(1.75rem, 4vw, 3rem)`, weight 760
- Metadata: `0.75rem`, uppercase or Korean label, tracking `0.06em`

### Space

Use an 8px base rhythm: 4, 8, 12, 16, 24, 32, 48. Dense route rows use 12–16px;
major panels use 24px. Avoid large empty hero space because this is a task surface.

### Shape and depth

- Radius: 0 for app shell, 8px controls, 12px cards, 18px mobile sheet.
- Border: 1px solid `--line`.
- Shadow: only floating map controls and mobile sheet; `0 8px 30px rgb(0 0 0 / 12%)`.
- No nested cards. Sections are separated by borders and spacing.

## Layout

### Desktop (`>= 960px`)

- Full-height shell.
- 400px control rail on the left; map fills the remaining viewport.
- Brand/direction controls stay at top; place, stop, and arrival controls scroll together.
- Map picker results appear as an anchored tray over the lower map edge.

### Mobile (`< 960px`)

- Map occupies the upper 42dvh.
- Content becomes a bottom sheet with an 18px top radius.
- Direction switch and refresh stay visible near the sheet top.
- Stop picker list expands within the sheet; controls remain at least 44px high.

## Component contracts

### Commute switch

- Exactly two options: `회사로` and `집으로`.
- Selection changes the active place collection and arrival list without destroying the other direction.
- Keyboard arrow keys and tab navigation work.

### Place and route-point collection

- Each direction stores multiple named places and keeps one active place.
- Each place stores multiple bus stops and subway stations; one bus stop stays active for arrivals.
- Adding, renaming, selecting, and deleting a place always has an equivalent button or form control.
- Every bus row renders the stop name and five-digit ARS ID; subway rows render station and line.
- Active place and stop use `aria-pressed`, a border, and a 3px signal strip.
- Removing an active place or stop selects the first remaining sibling; an empty collection stays valid.
- Newly active place chips scroll into view instead of disappearing beyond the horizontal rail.

### Map picker

- Moving the map does not trigger network requests continuously.
- Bus and subway pickers search only from their explicit `이 위치에서 찾기` action.
- Every result has a corresponding marker and row with name, ARS ID, and distance.
- Marker selection and row selection remain synchronized and allow multiple pressed items.
- Wheel, touch, and double-click zoom stay anchored to the map center.
- Saving is explicit and adds selected points to the active place without duplicating them.
- Closing does not overwrite or remove previously saved stops.

### Arrival row

- Route number is the first reading target.
- First ETA is large; second ETA is supporting text.
- Direction and remaining-stop message stay visible.
- Rows sort by numeric first ETA. Non-running routes move below active routes.
- Refresh has loading, success timestamp, empty, and error states.

### Route comparison

- 저장한 출발 정류장과 선택적 환승역을 목적지 장소에 연결해 명시적인 루트로 저장한다.
- 비교 카드는 `정류장 → 환승역 → 목적지` 순서와 ARS 기반 실시간 버스 대기를 보여준다.
- `버스 대기 1순위`는 현재 첫 버스 도착 대기만 비교하며 전체 통근시간으로 표현하지 않는다.
- 로딩·실패·도착정보 없음 상태는 순위에서 제외하고 나머지 루트 비교는 유지한다.

### Install and offline surface

- 네이티브 설치 이벤트가 준비되거나 삼성 인터넷으로 접속하면 헤더에 `앱 설치`를 노출한다.
- 설치 이벤트가 없으면 삼성 인터넷 메뉴의 `앱 화면에 설치` 경로를 짧게 안내한다.
- 설치 아이콘은 `--ink` 배경과 `--signal` 버스 기호, 192px·512px PNG, 마스킹 안전 여백을 유지한다.
- 오프라인에서는 앱 셸과 브라우저에 저장한 장소·경로를 복원한다.
- 실시간 도착정보, 새 정류장 검색, 지도 타일은 연결이 필요한 기능으로 유지한다.

## Interaction and motion

- Durations: 120ms press, 180ms hover/focus, 240ms sheet/row reveal.
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Buttons move at most 1px on press. No spring bounce.
- Selected map marker scales from 1 to 1.08; list rows use a border/color transition.
- Loading uses a static skeleton pulse only when motion is allowed.
- Under `prefers-reduced-motion: reduce`, all animation durations become 1ms and map motion is
  non-animated.

## Accessibility

- WCAG AA contrast minimum; primary text targets AAA.
- Visible 3px `--route-blue` focus ring with 2px offset.
- All map actions have equivalent list/button controls.
- Live refresh status uses `aria-live="polite"`; errors use `role="alert"`.
- Do not announce every map movement.
- Touch targets are at least 44 × 44px.

## Content

- Short Korean task language: `버스 정류장 추가`, `지하철역 추가`, `이 위치에서 찾기`.
- Avoid technical API wording in user-facing errors.
- Use absolute stop identity (`천호역 · 25014`) rather than ambiguous labels.
- Subway route points use OpenStreetMap Overpass station data and do not imply live arrivals.
- Timestamps use local Korean time and explain freshness (`20:14 기준`).

## Responsive and failure states

- No active place: ask the user to add a company or home before choosing stops.
- No stop selected: keep the active place and explain that arrivals require a selected stop.
- Permission denied: keep the default Seoul center and offer manual map movement.
- API timeout/error: preserve the last saved stop, show retry, never clear arrivals silently.
- No nearby stops: suggest zooming out or moving the map.
- No nearby subway stations: preserve saved route points and offer a new map-center search.
- No active buses: show the route as `운행 정보 없음`, not a blank card.
