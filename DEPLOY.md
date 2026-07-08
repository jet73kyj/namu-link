# 나무링크 GitHub Pages 배포 가이드

## 1. 배포 파일 준비 완료 ✅

- `.nojekyll` — Jekyll 처리 비활성화 (파일명 `_` 시작·`data/` 폴더 정상 서빙)
- `404.html` — 404 안내 페이지
- `.github/workflows/deploy-pages.yml` — 자동 배포 워크플로 (master/main 푸시 시)

## 2. GitHub Pages 활성화 (1회만)

1. GitHub 저장소 접속: https://github.com/jet73kyj/namu-link
2. **Settings** → **Pages** 이동
3. **Source**: `GitHub Actions` 선택
4. 저장

## 3. 배포 방법

### 자동 배포 (권장)
`master` 또는 `main` 브랜치에 push 하면 자동 배포됩니다:
```bash
git add .
git commit -m "deploy: 초기상담지 기능 추가"
git push origin master
```

배포 진행 상황:
- Actions 탭에서 진행 상황 확인
- 완료 시 URL: **https://jet73kyj.github.io/namu-link/**

### 수동 배포 트리거
Actions 탭 → "Deploy to GitHub Pages" → Run workflow

## 4. 배포 후 확인 URL

| 페이지 | URL |
|---|---|
| 메인 | https://jet73kyj.github.io/namu-link/index.html |
| 아동 관리 | https://jet73kyj.github.io/namu-link/children.html |
| 초기상담지 (학부모용) | https://jet73kyj.github.io/namu-link/assessment.html?token=xxx |
| 신규아동 | https://jet73kyj.github.io/namu-link/intake.html |

## 5. ⚠️ 중요 — 데이터 저장 방식

이 앱은 **localStorage 기반** 이므로:

- **각 브라우저·디바이스마다 데이터가 분리**됩니다
- 관리자 PC 에서 발급한 토큰은 **관리자 PC 의 브라우저에만** 저장됩니다
- 학부모가 링크로 접속하면 **학부모 디바이스의 localStorage** 에 응답이 저장됩니다
- 즉, 관리자 화면에서 학부모 제출 응답을 자동으로 조회할 수 없습니다

### 해결 방안 (선택)

- **(간단)** 학부모가 제출 완료 후 캡처·전화로 알려주는 방식
- **(중간)** 응답을 이메일·카카오톡·구글폼으로 전송하는 방식으로 변경
- **(정식)** Supabase/Firebase 같은 백엔드 DB 도입 (별도 개발 필요)

## 6. 로컬 테스트

배포 전 로컬에서 테스트하려면:

```bash
# Python 설치되어 있을 경우
cd C:\Users\rkdsk\OneDrive\Desktop\namu-link
python -m http.server 8000
# → http://localhost:8000/index.html 접속

# 또는 VS Code Live Server 확장 사용
```

## 7. 커스텀 도메인 (선택)

자체 도메인(예: `namu-link.co.kr`) 사용 시:
1. `CNAME` 파일 생성 (내용: `namu-link.co.kr`)
2. GitHub Settings → Pages → Custom domain 에 도메인 입력
3. 도메인 등록업체 DNS 에 CNAME 레코드 추가:
   `namu-link.co.kr → jet73kyj.github.io`
