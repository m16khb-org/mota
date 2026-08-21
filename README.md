# 모타

<p align="center">
  <img src="docs/icon.png" width="120" alt="모타 프로젝트 아이콘" />
</p>

지도 기반 서울 출퇴근 버스 대기 웹앱입니다. React 19와 Bun/Hono로 만들었습니다.

Hermes의 `/bus_company`, `/bus_home` 기능을 분리한 프로젝트입니다. 서울대중교통의
좌표 기반 근접 정류소 응답과 서울 BIS 실시간 도착정보를 서버에서 정규화해 제공하며,
브라우저에는 집→회사, 회사→집 정류장 선택만 저장합니다.

## 실행

```bash
pnpm install
pnpm build
pnpm start
```

서버는 기본적으로 `0.0.0.0`에 바인딩합니다. 로컬 전용 실행은
`HOST=127.0.0.1 pnpm start`를 사용하세요.

개발 시에는 `pnpm dev:api`와 `pnpm dev:web`을 각각 실행합니다.

## 검증

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

## 배포

```bash
docker compose up -d --build
docker compose logs -f web
```

프로덕션 컨테이너는 빌드된 `dist/`를 정적 서빙하며 기본 `HOST=0.0.0.0`,
`PORT=3000`으로 바인딩됩니다. 서울 교통 업스트림으로의 아웃바운드 접근이
필요합니다.

## 데이터 출처

- 서울대중교통 좌표 기반 근접 정류소
- 서울 BIS 정류소별 실시간 도착정보
- OpenStreetMap 지도 타일

공공 엔드포인트의 응답 스키마가 변경되면 서버 어댑터 테스트를 먼저 갱신하세요.
