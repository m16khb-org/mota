# 모타 앱 아이콘 — 디자인 프롬프트

`design/README.md`의 아트 디렉션과 `DESIGN.md`의 제품 계약에서 유도한 앱
아이콘 사양이다. 이미지 생성에 넣은 프롬프트, 그 프롬프트가 왜 그렇게 쓰였는지,
그리고 확정한 기하를 함께 둔다.

## 1. 무엇을 그리는가

**버스 정면.** 잉크 바탕 위에 흰 버스가 정면으로 서 있다. 넓은 앞유리 하나,
전조등 둘, 바퀴 둘. 그게 전부다.

기준은 하나다 — **한눈에 뜻이 읽히는가.** 앱 아이콘은 홈 화면에서 레이블 없이
혼자 서고, 사용자는 1초를 주지 않는다. 은유를 한 겹이라도 얹으면 읽히지 않는다.

이 결론에 오기까지 다섯 시안을 버렸다. 6절에 기록해 둔다.

버스만 그려서 지하철이 빠지는 것은 알고 받아들인 손해다. 아이콘이 무엇을
말하는지 아무도 모르는 것보다, 교통 앱이라는 것을 즉시 알리고 지하철은 앱
안에서 알리는 쪽이 낫다.

## 2. 색을 어떻게 정했는가

바탕은 잉크 `#16181D`, 마크는 흰색 `#FFFFFF`뿐이다. 노선색을 쓰지 않는다.

근거는 두 가지다.

- 아트 디렉션은 **"채도는 오직 노선에서만 나온다"**고 못박는다. 앱 아이콘은
  어떤 노선도 확정되지 않은 자리다. `DESIGN.md` 3절이 같은 상황을 이미
  규정한다 — **"노선이 확인되지 않으면 중립색을 쓴다."**
- 실측 대비가 뒷받침한다. 간선버스 파랑 `#3D5BAB`을 잉크 바탕에 얹으면 대비가
  2.78:1로, 작은 크기에서 형태가 뭉갠다. 흰색은 같은 바탕에서 17.9:1이다.

바탕을 잉크로 두는 쪽은 흰 바탕보다 두 가지가 낫다. 밝은 홈 화면에서 아이콘
경계가 사라지지 않고, `manifest.webmanifest`의 `theme_color`(`#16181D`)와
설치 아이콘이 같은 색으로 붙는다.

## 3. 기하 사양

96 격자로 그린다. 512px 출력에서는 모든 값에 16/3을 곱한다.

| 요소 | x | y | 너비 | 높이 | 반지름 | 색 |
|---|---:|---:|---:|---:|---:|---|
| 바탕 | 0 | 0 | 96 | 96 | 24 | `#16181D` |
| 왼쪽 바퀴 | 28 | 66 | 10 | 14 | 5 | `#FFFFFF` |
| 오른쪽 바퀴 | 58 | 66 | 10 | 14 | 5 | `#FFFFFF` |
| 차체 | 21 | 16 | 54 | 56 | 12 | `#FFFFFF` |
| 앞유리 | 28 | 24 | 40 | 18 | 6 | `#16181D` |
| 왼쪽 전조등 | 28 | 54 | 8 | 8 | 3 | `#16181D` |
| 오른쪽 전조등 | 60 | 54 | 8 | 8 | 3 | `#16181D` |

- 그리는 순서는 바탕 → 바퀴 → 차체 → 앞유리 → 전조등이다. 바퀴의 위쪽
  66~72는 차체에 가려지므로 잘린 끝이 드러나지 않는다.
- 차체는 21..75를 차지해 가로 중심이 48이다. 마크 전체는 16..80이라 세로
  중심도 48이다.
- 앞유리는 차체 안에서 좌우 여백 7로 같고, 전조등도 좌우 28과 60에 놓여
  대칭이다. 바퀴는 28..38과 58..68로 중심에서 각각 20 떨어진다.
- 차체 반지름 12는 시스템의 컨트롤 반지름이다. 앞유리 6과 전조등 3은 그
  절반, 다시 그 절반이다.

### UI 픽토그램과의 관계

`design/artboards/Main.dc.html`의 버스 픽토그램은 24px 격자에 2px 획이다.
앱 아이콘은 같은 형태를 **면으로** 만든다. 획으로 그린 픽토그램은 16px에서
선이 사라지지만, 면으로 만든 아이콘은 실루엣이 남는다. 둘은 같은 대상을
다른 크기 조건에서 그린 것이며, 서로를 대체하지 않는다.

## 4. 금지 사항

`design/README.md`의 "쓰지 않는다"를 아이콘에 그대로 적용한다.

- 그라디언트, 유리 효과, 광택, 그림자, 반사, 외곽선
- 장식 일러스트, 원근, 3D, 텍스처, 노이즈
- 글자, 숫자, 이모지, 딩벳
- 잉크와 흰색 외의 색

## 5. 이미지 생성 프롬프트

영어로 쓴다. 기하 용어와 색상 코드가 영어 프롬프트에서 더 정확하게 지켜진다.
비율은 캔버스 크기에 대한 백분율로 적는다. 생성 모델은 절대 좌표를 지키지
못하므로 3절의 격자가 최종 사양이고, 프롬프트는 그 형태를 얻기 위한 것이다.

```text
A flat vector app icon, a single square image, no background scene, no mockup,
no device frame, no drop shadow.

A rounded square fills the canvas edge to edge, corner radius exactly 25% of the
canvas width, filled with solid flat #16181D.

Inside it, centered, a bold white #FFFFFF pictogram of a bus seen from the front,
extremely simplified, solid filled, no outline strokes:
- The bus body is a rounded rectangle, width 56% of the canvas, height 60% of the
  canvas, corner radius 12% of the canvas, horizontally centered, top edge at 16%
  of the canvas height.
- A single wide windshield is cut out of the body in the background color #16181D:
  a rounded rectangle spanning 76% of the body width, 30% of the body height,
  centered horizontally, positioned in the upper part of the body with an even
  margin above it.
- Two small square headlights are cut out of the body in the background color
  #16181D, near the bottom left and bottom right of the body, each 14% of the body
  width, with rounded corners.
- Two short vertical wheels in white #FFFFFF extend below the body, one on the left
  and one on the right, each 14% of the canvas wide and 8% of the canvas tall, with
  rounded bottom ends.

The result reads instantly as the front of a bus.

Style: strict flat vector, transit signage, Swiss graphic design. Exactly two colors
#16181D and #FFFFFF. No gradients, no gloss, no bevel, no shadow, no outline, no
texture, no noise, no 3D, no highlights. No text, no numbers, no letters. Crisp hard
edges, pure geometry only.
```

## 6. 버린 방향과 이유

여덟 시안을 생성해 비교했다. 처음 다섯은 모두 "밴드와 표지판으로 도착 정보를
은유한다"는 한 갈래였고, 전부 같은 이유로 실패했다 — **뜻이 읽히지 않는다.**

| 시안 | 형태 | 버린 이유 |
|---|---|---|
| A | 왼쪽 정렬 밴드 3개 | `align-left`·`sort` 아이콘과 형태가 같다 |
| B | 기둥 왼쪽 + 밴드 3개 | 알파벳 `F`로 읽힌다. 시스템은 글자를 금지한다 |
| C | 밴드 + 오른쪽 셰브런 | 평범한 화살표다. 제품을 가리키지 않는다 |
| D | 가운데 정렬 밴드 3개 | `filter` 아이콘과 형태가 같다 |
| F | 정류장 표지판 + 두 줄 | 한 번 채택했으나 막대사탕·주걱으로 읽혀 폐기 |
| 1 | 노선 위의 역 | 위치 핀·과녁과 헷갈린다 |
| 3 | 도착까지 남은 분(숫자 3) | 숫자가 임의다. 3분이 아닐 때 거짓말이 된다 |
| **2** | **버스 정면** | **채택** |

F의 폐기가 이 문서의 교훈이다. "정류장 표지판에 도착 두 줄"은 제품 구조를
정확히 옮긴 은유였지만, 아이콘은 구조를 설명하는 자리가 아니다. 설계자에게만
읽히는 형태는 실패한 형태다.

## 7. 산출물

| 파일 | 크기 | 배경 | 비고 |
|---|---|---|---|
| `app-icon.svg` | 96 격자 | 투명 모서리 | 원본. 브랜드 헤더 마크와 공유한다 |
| `app-icon-192.png` | 192 | 투명 모서리 | |
| `app-icon-512.png` | 512 | 투명 모서리 | |
| `app-icon-maskable-512.png` | 512 | 불투명 정사각 | 마크를 중심 기준 0.85배로 줄인다 |
| `apple-touch-icon.png` | 180 | 불투명 정사각 | iOS가 모서리를 직접 깎는다 |

maskable과 apple-touch는 라운드 모서리를 쓰지 않는다. 플랫폼이 자기 규격으로
자르므로 잉크 바탕을 정사각으로 채운다.

maskable만 마크를 0.85배로 줄인다. 원래 크기에서는 차체 꼭짓점이 중심에서
41.9만큼 떨어져 안전 원(반지름 38.4)을 벗어난다. 0.85배에서는 35.6으로 들어온다.

## 8. 렌더링 방법

저장소에 SVG 래스터라이저가 없다. 헤드리스 Chrome으로 뽑는다.

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --default-background-color=00000000 \
  --window-size=512,512 --screenshot=out.png "file://$PWD/wrapper.html"
```

`wrapper.html`은 `html,body{margin:0;background:transparent}`와 명시적
`width`·`height`를 준 SVG 하나만 담는다. 불투명 자산은
`--default-background-color`를 빼는 대신 SVG 안에서 정사각 바탕을 채운다.

검수는 16·24·32·48·64·96px을 한 줄에 놓고 밝은 바탕과 어두운 바탕에서 함께
본다. 16px에서 실루엣이 무너지면 그 형태는 쓰지 않는다.
