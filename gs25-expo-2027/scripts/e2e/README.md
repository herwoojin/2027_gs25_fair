# e2e 회귀 스크립트

개발 서버(`npm run dev`)를 띄운 상태에서 실행합니다.

```bash
APPS_SCRIPT_KEY="$(grep -m1 APPS_SCRIPT_KEY ../../.env.local | cut -d= -f2)" node scripts/e2e/stores.mjs
```

> ⚠️ 키·비밀값은 **절대 이 폴더의 파일에 적지 마세요.**
> 넷리파이 시크릿 스캐너가 빌드를 막고, 저장소에 남으면 키를 교체해야 합니다.
