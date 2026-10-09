# 모타 디자인 시스템 — 당근 SEED Design

모타는 당근의 디자인 시스템 [SEED Design](https://seed-design.io)을 쓴다.
색, 글자, 간격, 모서리, 그림자, 모션 값은 모두 공식 패키지
`@seed-design/css`의 CSS 변수(`--seed-*`)에서 가져온다. 값을 손으로 옮겨
적지 않는다.

## 에이전트를 위한 안내

**이것이 모타의 디자인 시스템이다.** 새 화면과 새 컴포넌트는 SEED 토큰과
컴포넌트 규격을 따른다.

읽는 순서:

1. 이 문서 — 적용 방식과 모타가 SEED에 더한 규칙
2. 루트 `DESIGN.md` — 제품 계약, 토큰을 앱 컴포넌트에 대응시킨 표, 반응형 구조
3. SEED 원문 — [Foundations](https://seed-design.io/foundations/llms.txt),
   [Components](https://seed-design.io/components/llms.txt). 정확한 수치는
   `node_modules/@seed-design/css/recipes/*.css`의 레시피가 원본이다.

## 적용 방식

- `apps/web/src/main.tsx`가 `@seed-design/css/base.css`를 앱 스타일보다 먼저
  불러온다. `base.css`는 토큰과 기반 규칙만 담고, 컴포넌트 클래스는 담지 않는다.
- `apps/web/index.html`의 `<html data-seed-color-mode="light-only">`로 라이트
  모드에 고정한다. 지도 타일과 노선색이 라이트 바탕을 전제하기 때문이다.
- `@seed-design/react` 컴포넌트는 쓰지 않는다. 기존 마크업의 `tablist`,
  `aria-pressed`, 방향키 이동 계약을 그대로 두고, `apps/web/src/styles.css`가
  SEED 컴포넌트 규격(Action Button, Segmented Control, List, Badge, Callout,
  Skeleton)을 토큰으로 재현한다.
- 글꼴은 `--seed-font-family`(시스템 글꼴 우선)를 `body`에 적용한다. SEED가
  Windows용으로 지정한 Pretendard는 이름만 나열되므로 jsDelivr에서 직접 받는다.

## 모타가 SEED에 더한 규칙

SEED에 없는 값만 `styles.css` 상단의 `--mota-*`로 둔다.

- `--mota-control-min: 44px` — 모든 터치 대상의 하한. SEED Medium 버튼(40px)도
  44px로 올린다.
- `--mota-route-band: 6px` — 정류장 행, 도착 카드, 후보 카드의 노선 밴드.
- 노선색(`--route-color`, `--route-badge-color`, `--route-ink`)은 서울 버스
  운행 기관이 정한 값이다. 브랜드 색이 아니라 운행 데이터로 취급해 SEED 토큰으로
  바꾸지 않는다.

## 색을 쓰는 원칙

- 브랜드 색(당근 주황 `--seed-color-bg-brand-solid`)은 화면의 핵심 행동 하나에만
  쓴다. 기본 화면의 `정류장 찾기`, 찾기 상태의 `저장`이 그 자리다.
- 선택 상태는 `bg-brand-weak` 면과 `fg-brand-contrast` 체크 아이콘으로 표시하고,
  `aria-pressed`·굵은 글자·경계를 함께 써서 색 없이도 구분되게 한다.
- 글자색은 `fg-neutral`과 `fg-neutral-muted`까지 쓴다. `fg-neutral-subtle`과
  `fg-placeholder`는 4.5:1을 넘지 못하므로 아이콘에만 쓴다.
- 오류는 SEED Callout의 critical 톤(`bg-critical-weak` +
  `fg-critical-contrast`)을 쓴다.
- 그라디언트를 쓰지 않는다. SEED Skeleton의 shimmer 대신 회색 두 단계의
  펄스를 쓴다.

## 파일

```text
README.md                      이 문서
app-icon-prompt.md             설치 아이콘의 근거와 격자 사양
artboards/                     이전 서울 사인 시스템의 아트보드(과거 참고 자료)
```

`artboards/`는 SEED 채택 전 시스템의 시각 기록이다. 토큰과 컴포넌트 규격의
원본이 아니며 새 화면을 그 값으로 만들지 않는다.
