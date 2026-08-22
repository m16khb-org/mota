# 모타 Design System

## Product brief

`모타`(mota — "뭐 타?")는 출근 직전 또는 퇴근 직전, 사용자가 지도에서 정확한 서울 버스 정류장과
지하철역을 경로로 고르고 도착 목록에서 본 정확한 노선·방향을 즐겨찾기로 저장한 뒤,
도보·버스·지하철 순서의 통근 절차를 직접 만들어 출발 안내와 도착 예정 시간을 확인하는 웹앱이다.
여러 회사와 집을 이름으로 구분하고 각 장소에 여러 경로 지점을 저장하며, `회사로`(집 → 회사)와
`집으로`(회사 → 집)을 화면의 두 방향으로 보존한다.

### Primary persona

- 서울에서 버스로 출퇴근하며 정류장 이름이 비슷해 반대편 정류장을 자주 혼동하는 사람
- 이동 중 한 손과 짧은 주의 시간으로 사용한다.
- 가장 중요한 질문은 “지금 저장한 절차대로 언제 나가야 하고 몇 시에 도착하는가?”이다.

### Success criteria

1. 첫 사용자가 30초 안에 지도에서 버스 정류장이나 지하철역을 장소별로 저장한다.
2. 사용자는 회사와 집을 각각 제한 없이 만들고 각 장소에 여러 경로 지점을 저장한다.
3. 지도 마커를 여러 개 선택해 한 번에 경로에 추가한다.
4. 재방문 사용자는 장소와 버스 정류장을 한 번의 탭으로 전환하고 도착정보를 새로고침한다.
5. 정류장명, ARS 번호, 역명, 지도 위치를 함께 보여 잘못된 지점 선택을 줄인다.
6. 사용자는 저장한 절차와 즐겨찾기의 출발 안내·도착 예정을 한 화면에서 읽는다.
7. 사용자는 브라우저의 설치 표면에서 앱을 설치하고 오프라인에서도 저장한 화면을 다시 연다.

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
| `--line-strong` | `#a8a8a0` | Emphasized dashed outlines for empty-state blocks |
| `--muted` | `#62625d` | Secondary text |
| `--signal` | `#c7f000` | Active commute direction, selected stop |
| `--signal-soft` | `#f4fbd6` | Selected picker/result row surface (pale signal tint) |
| `--signal-ink` | `#182000` | Text on signal |
| `--route-blue` | `#155eef` | Route identity and map focus |
| `--subway` | `#7c3aed` | Subway identity: station rows and map markers |
| `--danger` | `#c81e1e` | Errors only |
| `--danger-ink` | `#721c1c` | Error text on the danger surface |
| `--danger-surface` | `#fff2f0` | Tinted error block background |
| `--danger-strong` | `#d92d20` | Strong error border on dark map trays |
| `--danger-soft-ink` | `#ffd5d0` | Error text on dark map trays |
| `--on-ink` | `#ffffff` | Text and rings sitting on `--ink` surfaces |
| `--ink-overlay-panel` | `rgb(11 11 11 / 92%)` | Dark map-tray card (stage copy) |
| `--ink-overlay-note` | `rgb(11 11 11 / 88%)` | Dark map-tray note (search status) |
| `--ink-overlay-quiet` | `rgb(11 11 11 / 82%)` | Dark map-tray caption (data note) |
| `--scrim` | `rgb(11 11 11 / 48%)` | Picker overlay backdrop |
| `--stage-line` | `#515447` | Border on dark map trays (status pill) |
| `--stage-line-quiet` | `#45483c` | Quieter border on dark map trays (data note) |
| `--stage-muted` | `#aeb1a7` | Secondary text on dark map trays |
| `--map-base` | `#e6e9e1` | Map stage and picker map background behind tiles |
| `--skeleton-base` | `#eeeeea` | Loading skeleton resting surface |
| `--skeleton-raised` | `#deded8` | Loading skeleton pulse target |

Color never carries state alone. Active tabs use color, weight, and shape; errors include icon and text.

Platform literals outside CSS: `index.html` `<meta name="theme-color">` and the manifest's
`theme_color`/`background_color` must be literal hex (the browser/OS consumes them before CSS
loads); they mirror `--ink` and `--paper` and change only with those tokens. The same applies to
`public/pwa-icon.svg`: SVG `fill`/`rect` attributes are consumed by the manifest icon pipeline
with no cascade, so its `#0b0b0b` (`--ink`) background/bus cutouts and `#c7f000` (`--signal`) bus
body are intentional token mirrors, changed only alongside those tokens.

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
- Elevation tokens (shadow recipes): `--shadow-control` `0 4px 16px rgb(0 0 0 / 12%)`
  (floating map controls), `--shadow-card` `0 8px 30px rgb(0 0 0 / 18%)` (stage card),
  `--shadow-pin` `0 6px 20px rgb(0 0 0 / 25%)` (center pin), `--shadow-overlay`
  `0 18px 80px rgb(0 0 0 / 30%)` (picker shell), `--shadow-sheet`
  `0 -8px 30px rgb(0 0 0 / 12%)` (mobile sheet). Shadows appear only on floating
  map controls and the mobile sheet.
- No nested cards. Sections are separated by borders and spacing.
- Map markers: the visible circles (`18–22px`) are non-interactive and styled by
  token classes (`.map-marker-bus`/`-subway`/`-pending`, `.is-active` → `--signal`
  fill + `--ink` stroke); interaction lives on the separate invisible 44px hit
  circle.

## Layout

### Desktop (`>= 960px`)

- Full-height bounded shell (`100dvh`, `overflow: hidden`): the document never scrolls.
- 400px control rail on the left; map fills the remaining viewport in one bounded row.
- The rail's scroll pane (`.rail-scroll`) is the ONLY vertical scroll owner; rail scrolling
  never moves the map, and the map stays fully painted while rail content scrolls.
- Brand/direction controls stay at top; place, stop, and arrival controls scroll together.
- Map picker results appear as an anchored tray over the lower map edge.

### Mobile (`< 960px`)

- Bounded `100dvh` column shell: the document never scrolls.
- The sheet below is the primary surface. The map defaults to the upper 30dvh and stays
  fully painted; it is the interactive marker surface (the display headline is desktop-only
  so it never covers markers).
- The map exposes a `지도 펼치기` toggle (44px, bottom-center) that expands it to 55dvh and
  back (`지도 접기`); the height snaps without layout animation, and the map repaints on
  container resize (Leaflet `invalidateSize`), never leaving gray edges.
- The sheet scrolls internally (`overscroll-behavior: contain`) with an 18px top radius.
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
- Revealing the active place chip scrolls only the horizontal chip rail (its own overflow container);
  it never scrolls the document or the vertical rail, so mobile loads stay anchored at the map.

### Map picker

- Moving the map does not trigger network requests continuously.
- Bus and subway pickers search only from their explicit `이 위치에서 찾기` action.
- Every result has a corresponding marker and row with name, ARS ID, and distance.
- Marker selection and row selection remain synchronized and allow multiple pressed items.
- Wheel, touch, and double-click zoom stay anchored to the map center.
- Saving is explicit and adds selected points to the active place without duplicating them.
- Closing does not overwrite or remove previously saved stops.
- On the main stage, subway station markers share the rail selection state: click or keyboard
  activation opens the same station detail as the rail row, and the marker mirrors `aria-pressed`.
- Marker colors come from the token set (`--route-blue`, `--subway`, `--signal`, `--surface`),
  never one-off hex values.

### Arrival row

- Route number is the first reading target.
- First ETA is large; second ETA is supporting text.
- Direction and remaining-stop message stay visible.
- Rows sort by numeric first ETA. Non-running routes move below active routes.
- Refresh has loading, success timestamp, empty, and error states.

### Selected procedure ETA (통근 절차)

- 각 장소는 순서 있는 통근 절차를 여러 개 저장하고 하나를 선택 상태로 유지한다.
- **기본 작성 방식은 경로만 선택(`auto`)**: 사용자는 저장한 정류장·역을 순서대로만 골라 이름을 짓는다.
  노선 선택, 대기 시간, 이동 시간을 묻지 않는다.
- 출발 위치(출발지)는 장소에 한 번만 저장하며 `현위치로 출발지 설정`으로 설정한다. 출발지가 있으면
  첫 정류장까지의 도보 시간과 `언제 나가야 하는지` 출발 안내가 계산된다.
- 실행 시간 자동 계산(`src/domain/autoCommuteEstimate.ts`):
  - 첫 정류장까지 도보는 출발지와 정류장 좌표의 직선 거리(4.5km/h)다.
  - 탑승 노선은 실시간 도착목록에서 자동 선택한다. 후보 노선은 노선 경유 정류장 목록(`getStaionByRoute`, 서버 24시간 캐시)
    으로 검증한다: 노선이 다음 경유지 400m 내에 정차하고 행선지가 필요한 종점 방향이면 `노선 확인` 배지를 붙이고
    이동 시간을 노선이 실제로 거치는 정류장 간 거리 합(≈18km/h)으로 계산한다. 검증된 노선이 우선 선택되고,
    검증 정보가 없으면 행선지 이름 일치 우선, 없으면 가장 먼저 오는 노선을 고른다. 선택 근거는 실시간/예상/오래됨으로 표시된다.
  - 탑승 구간 이동 시간은 좌표 거리 기준이다(버스 15km/h·우회 1.4, 지하철 33km/h·우회 1.25).
  - 실시간 대기를 잡지 못하면 기본 대기(버스 5분·지하철 4분)로 예상치를 계산하고 근거를 `예상`으로
    밝힌다. 실시간 데이터가 없어도 총 소요 시간은 항상 나온다.
- 절차 편집(`ready`) 모드는 기존 상세 절차의 수정으로만 노출된다: 버스·지하철 단계는 저장한
  정확한 즐겨찾기 서비스를 선택한다. 각 단계의 이동 시간은 두 지점(앞뒤 대중교통 지점)의
  직선 거리로 자동 계산되어 기본값으로 채워진다(도보 4.5km/h, 올림). 자동 값에는
  `거리 기준 자동 계산` 표시가 붙고, 사용자가 한 번 수정하면 그 필드는 사용자 소유가 되어
  재계산되지 않는다. 앵커가 없는 구간(첫/마지막 구간, 미선택 서비스)과 연속 도보는 값을
  지어내지 않고 `자동 계산 불가 · 직접 입력`으로 안내하며, 연속 도보가 되면 기존 자동
  값도 즉시 비워진다.
- 대시보드는 선택한 절차의 출발 안내(라이브 첫 탑승 대기 기준)와 도착 예정 시간, 단계별
  `실시간|예상|오래됨|정보 없음` 근거를 보여준다.
- 결과는 “실시간 탑승 대기 + 저장한 이동·대기 시간 추정”이며 전체 구간이 실시간이라고
  주장하지 않는다. 미래 환승 예측이 없으면 그 단계만 저장한 대안 대기 시간으로 `예상` 표기한다.
- 각 절차 단계는 24px(컴팩트 컨테이너 20px) 인라인 거터를 유지해 필드가 레일 가장자리에
  붙지 않고 한글 입력과 포커스 링이 잘리지 않는다.
- 이전 버전 루트는 `설정 필요` 초안으로 남고 즐겨찾기 선택 전에는 계산에 들어가지 않는다.
- 막힌 단계가 있으면 계산된 앞 구간을 유지하고 경로 수정·재확인 동작을 제공한다.

### Favorite departures (즐겨찾기 출발)

- 버스·지하철 도착 행에서 저장하면 정확한 노선·방향(또는 호선·상하행)만 카드로 보여준다.
- 카드는 다음 두 도착과 기준 시각, 접근 시간 기반 `N분 후 출발/지금 출발` 안내를 제공한다.
- 출발 안내는 최근 성공 스냅샷이 90초 이내이고 최근 시도가 실패하지 않았을 때만 나온다.
- 갱신 실패·오래된 정보는 해당 카드에만 표시하고 다른 카드와 저장 데이터를 유지한다.
- 같은 화면의 활성 절차와 즐겨찾기는 하나의 갱신 주기(표시 중 30초, 숨김 중지)를 공유한다.
- 선택한 정류장·역이 이미 이 갱신 집합에 있으면 상세 패널은 같은 스냅샷을 재사용하고
  겹치는 요청을 추가하지 않는다. 집합에 없는 지점은 핀 저장 전 전체 상세를 직접 불러온다.

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
- Subway route points use OpenStreetMap Overpass station data; selecting a saved station shows live Seoul subway arrivals with line badge, direction, and ETA.
- Timestamps use local Korean time and explain freshness (`20:14 기준`).

## Responsive and failure states

- No active place: ask the user to add a company or home before choosing stops.
- No stop selected: keep the active place and explain that arrivals require a selected stop.
- Permission denied: keep the default Seoul center and offer manual map movement.
- API timeout/error: preserve the last saved stop, show retry, never clear arrivals silently.
- No nearby stops: suggest zooming out or moving the map.
- No nearby subway stations: preserve saved route points and offer a new map-center search.
- No active buses: show the route as `운행 정보 없음`, not a blank card.
