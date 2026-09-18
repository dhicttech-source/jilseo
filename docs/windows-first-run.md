# Windows에서 처음 실행하는 법

## 설치 파일 받기
1. GitHub 저장소 → **Actions** → `windows-build` → 가장 최근 성공한 실행 클릭
2. 아래 **Artifacts**의 `jilseo-windows-x64` 다운로드 → 압축 해제 → `jilseo_0.1.0_x64-setup.exe`

## 설치
- 더블클릭 → **SmartScreen** 파란 경고("Windows의 PC 보호")가 뜨면 **추가 정보 → 실행**
  (개인용이라 코드 서명이 없어서 뜨는 경고입니다)
- 설치는 현재 사용자 계정에만 되며 관리자 권한이 필요 없습니다
- WebView2 런타임이 없으면 설치 중 자동으로 내려받습니다 (Windows 11은 기본 내장)

## 처음 실행
1. 각 패널에서 ChatGPT · Claude · Gemini 에 직접 로그인
   - Windows에서는 패스키(Windows Hello)가 될 수도 있습니다. 안 되면 "다른 방법 시도 → 비밀번호"
2. 앱을 완전히 종료(창 닫기) 후 다시 실행 → 로그인이 유지되는지 확인
3. 하단 입력창에 질문 1건 → 보내기 → 세 패널 상태가 "전송됨 → 응답 완료"로 바뀌는지
4. 헤더의 **진단** 클릭 → `%APPDATA%\jilseo\diagnostics.json` 생성

## Google 로그인이 "이 브라우저는 안전하지 않을 수 있습니다"로 막히면
빈 파일을 하나 만들고 앱을 재시작하면 Chrome User-Agent로 고정됩니다.
```
%APPDATA%\jilseo\force-chrome-ua
```
(탐색기 주소창에 `%APPDATA%\jilseo` 입력 → 새 텍스트 문서 만들고 이름을 `force-chrome-ua`로, 확장자 없이)

## 파일 위치
- 설정·워크스테이션·큐: `%APPDATA%\jilseo\`
- 셀렉터 JSON: `%APPDATA%\jilseo\services\`
- 서비스별 로그인 세션(쿠키): `%APPDATA%\jilseo\partitions\<서비스>\`
