# 내 버스 Design System

## Product brief

`내 버스`는 출근 직전 또는 퇴근 직전, 사용자가 지도에서 정확한 서울 버스 정류장을
고르고 가장 먼저 오는 버스를 확인하는 단일 목적 웹앱이다. Hermes의 `bus_company`
(집 → 회사)와 `bus_home`(회사 → 집)을 화면의 두 방향으로 보존한다.

### Primary persona

- 서울에서 버스로 출퇴근하며 정류장 이름이 비슷해 반대편 정류장을 자주 혼동하는 사람
- 이동 중 한 손과 짧은 주의 시간으로 사용한다.
- 가장 중요한 질문은 “어느 정류장에서 어떤 버스가 몇 분 뒤 오는가?”이다.

### Success criteria

1. 첫 사용자가 30초 안에 지도에서 정확한 ARS 정류장을 두 방향에 저장한다.
2. 재방문 사용자는 한 번의 탭으로 현재 방향의 도착정보를 새로고침한다.
3. 정류장명, ARS 번호, 지도 위치가 항상 함께 보여 반대편 정류장 오선택을 줄인다.

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
- Brand/direction controls stay at top; selected stop and arrivals scroll independently.
- Map picker results appear as an anchored tray over the lower map edge.

### Mobile (`< 960px`)

- Map occupies the upper 42dvh.
- Content becomes a bottom sheet with an 18px top radius.
- Direction switch and refresh stay visible near the sheet top.
- Stop picker list expands within the sheet; controls remain at least 44px high.

## Component contracts

### Commute switch

- Exactly two options: `회사로` and `집으로`.
- Selection changes the active saved stop and arrival list without destroying the other direction.
- Keyboard arrow keys and tab navigation work.

### Stop card

- Always renders stop name, five-digit ARS ID, and direction label.
- Empty state is a direct action: `지도에서 정류장 선택`.
- Selected card uses a 3px signal strip, not a full colored background.

### Map picker

- Moving the map does not trigger network requests continuously.
- `이 위치에서 찾기` fetches official nearby stops at the map center.
- Every result has a corresponding marker and row with name, ARS ID, and distance.
- Marker selection and row selection remain synchronized.
- Saving is explicit; closing does not overwrite the previous stop.

### Arrival row

- Route number is the first reading target.
- First ETA is large; second ETA is supporting text.
- Direction and remaining-stop message stay visible.
- Rows sort by numeric first ETA. Non-running routes move below active routes.
- Refresh has loading, success timestamp, empty, and error states.

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

- Short Korean task language: `정류장 선택`, `이 위치에서 찾기`, `새로고침`.
- Avoid technical API wording in user-facing errors.
- Use absolute stop identity (`천호역 · 25014`) rather than ambiguous labels.
- Timestamps use local Korean time and explain freshness (`20:14 기준`).

## Responsive and failure states

- No stop selected: explain that two commute directions are stored separately.
- Permission denied: keep the default Seoul center and offer manual map movement.
- API timeout/error: preserve the last saved stop, show retry, never clear arrivals silently.
- No nearby stops: suggest zooming out or moving the map.
- No active buses: show the route as `운행 정보 없음`, not a blank card.
