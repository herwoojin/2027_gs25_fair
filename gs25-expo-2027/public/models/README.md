# public/models

공개 가능한 **셸 모델만** 둡니다 (빈 진열대, 로고 등).
신상품 패키지 텍스처 등 민감 에셋은 Cloud Storage 서명 URL(15분 만료)로 로드합니다. — GUIDE 5장

최적화:
```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2
```
규칙: 섹션당 ≤3MB(모바일), 삼각형 ≤10만, 텍스처 1024px 이하.
