# AI 로직 덮어쓰기 위험 분석

## aiTick 실행 순서 (덮어쓰기 관점)

```
1. aiUseIFVPassengers    ← 엔지니어IFV 침투, 저격IFV, 탑승 페어링
2. aiParkEmptyIFVs       ← 빈 IFV → 집결지
3. aiUnstickEngineers    ← 엔지니어(도보) 밀어내기
4. aiEmergencyDefend     ← 기지 경보 시 유닛 급파
5. 저격병 블록           ← 저격병 order 덮어씀
6. rushDefense           → aiCommandMoveToRally
7. Vehicle crush         ← 탱크/굴착기 order 덮어씀 (보병 밟기)
8. infRushThreat && !hasFac → return
9. nextWave              ← 보병/탱크/IFV attackmove
10. playerHasSniperThreat ← 보병 attackmove
11. Engineer harassment  ← 엔지니어(도보) capture/defend
12. harassNext           ← 하라스 스쿼드
13. Army behavior        ← aiCommandMoveToRally, aiCommandAttackWave
```

---

## 현재 보호된 항목 ✓

| 대상 | 보호 방식 |
|------|----------|
| 엔지니어IFV | aiCommandMoveToRally에서 `passKind==="engineer"` 시 continue |
| 엔지니어IFV | aiCommandAttackWave에서 continue |
| 엔지니어IFV | aiEmergencyDefend에서 `passKind==="engineer"` 시 unitsNearBase 제외 |
| 엔지니어IFV 수리 덮어쓰기 | sim: allowAutoRepair가 `move` order일 때 false → 수리 탐색/덮어쓰기 안 함 |
| 저격IFV | nextWave pack에서 `passKind==="sniper"` IFV 제외 |
| 하라스 스쿼드 | engineer IFV 필터링 |

---

## 덮어쓰기 위험 후보

### 1. **경로탐색 예산 (setPathTo 실패)** ✓ 수정됨
- `_pathFindBudget` 소진 시 setPathTo가 false 반환
- **수정**: 예산 소진 시 `u.path = null`, `u.pathI = 0` 초기화 후 return → order와 path 불일치 방지

### 2. **aiParkEmptyIFVs vs 탑승 중 IFV**
- `_pickupTargetId` 있으면 continue로 보호됨 ✓
- 단, `_pickupTargetId`가 null로 초기화되는 타이밍에 따라 빈틈 가능

### 3. **sim 틱 vs AI 틱 순서**
- 매 프레임: **sim → AI** 순 실행
- sim에서 설정한 order/path를 AI가 덮어씀
- 반대로 sim이 AI order를 덮어쓰는 경우는 engineer IFV 수리 블록뿐이며, `allowAutoRepair`로 move order 시 비활성화됨 ✓

### 4. **aiUnstickEngineers**
- `ot !== "idle" && ot !== "guard"` 이면 continue
- 엔지니어(도보)가 capture/move 중이면 덮어쓰지 않음 ✓
- `inTransport`면 continue ✓

### 5. **Engineer harassment**
- `idleIFVs.length > 0`이면 전체 블록 스킵 ✓
- `eng.inTransport`면 continue ✓

---

## 적용된 수정

1. **setPathTo 예산 소진 시** (sim.js): `_pathFindBudget <= 0`이면 `u.path = null`, `u.pathI = 0` 후 return. 다음 틱에 sim이 재경로 계산.

## 권장 모니터링

- **엔지니어IFV 수리**: `allowAutoRepair`가 move를 제외하고 있어 현재는 안전. 추후 order 타입 추가 시 이 조건 재검토 필요
