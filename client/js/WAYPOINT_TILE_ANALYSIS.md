# 보병·탱크 웨이포인트·타일 안착 이슈 분석

## 개요

보병(infantry)과 탱크(veh) 유닛이 웨이포인트 경로를 따라 이동한 후, 목표 타일에 도착했을 때의 동작 흐름과 잠재 이슈를 분석했습니다.

---

## 1. 보병(Infantry) 흐름

### 1.1 경로 추종: `followPathInfantry` (sim.js ~1490–1645)

- **도착 판정**: `ARRIVE_EPS = 4` (거리 < 4px)
- **마지막 타일**: 목표를 `tileToWorldSubslot(p.tx, p.ty, slot)`로 설정
- **navSlot 선점**: `infSlotMask0/1`에서 빈 slot을 찾아 예약
- **도착 시 처리**:
  - `u.x = sp.x`, `u.y = sp.y` (서브슬롯 위치로 즉시 스냅)
  - `u.holdPos = true`
  - `subSlot`, `subSlotTx`, `subSlotTy` 갱신
  - `path = null`, `order = idle` 또는 `guard`

### 1.2 안착 보정: `settleInfantryToSubslot` (sim.js ~2426, 2554)

- **조건**: `order.type === "idle"` 또는 `"guard"`, `target == null`
- **실행 시점**: `followPath` 호출 직후, move/attackmove/guard_return 처리 후

**동작 요약**:
1. 이미 subslot 근처 (toSlot² < 25) → 즉시 스냅, `holdPos = true`
2. 타일 중심에서 너무 멀리 떨어짐 (toCenter² > (0.12×TILE)²) → 아무것도 안 함
3. **과포화 (occInf > 4)**: 타일 중심으로 강제 스냅 → subslot 무시
4. subslot과 거리² < 25 → 즉시 스냅
5. 그 외: subslot 방향으로 점진적 이동

### 1.3 `clearOcc` / `updateOccForUnitMove` 타이밍

- `clearOcc`: 매 프레임 시작 시, 모든 유닛의 **현재** 위치로 occupancy·infSlotMask 재계산
- `updateOccForUnitMove`: 유닛이 타일을 옮길 때 occupancy 갱신
- `infSlotMask`: 타일별 4비트 마스크 (슬롯 0~3 점유 여부)
- `followPathInfantry`에서 navSlot 예약 시 같은 프레임 내에서 mask 갱신 → 선처리한 유닛이 slot을 먼저 차지

---

## 2. 탱크(Vehicle) 흐름

### 2.1 경로 추종: `followPath` (sim.js ~1646–1784)

- **도착 판정**: `d < 2` 또는 (마지막 웨이포인트 && `d < 12`)
- **최종 위치**: `(p.tx+0.5)*TILE`, `(p.ty+0.5)*TILE` (타일 정중앙)
- **서브슬롯 없음**: 여러 탱크가 같은 타일 도착 시 모두 타일 중심에 겹침
- **도착 시**: `holdPos = false` (보병과 반대)

### 2.2 RA2 스타일 가속/감속

- `_vehCurSpeed`로 가속률 0.03 적용
- 회전 시 속도 감소 (0.12)
- 도착 시 `_vehCurSpeed = 0`으로 리셋

---

## 3. 잠재 이슈 및 주의점

### 3.1 보병 (높음)

| 이슈 | 설명 | 심각도 |
|-----|------|--------|
| **과포화 시 subslot 무시** | `occInf > 4`이면 모든 보병을 타일 중심으로 강제 이동. 이때 `subSlot`/`subSlotTx`/`subSlotTy`는 유지되나 실제 위치는 중심 → 다음 프레임 `settleInfantryToSubslot`에서 중심 근처라 `toCenter2`/`occInf` 분기만 타고 subslot 쪽 보정이 안 될 수 있음 | 중 |
| **navSlot 경쟁** | 같은 타일로 동시에 들어오는 다수의 보병이 `infSlotMask`를 공유. 처리 순서에 따라 slot 할당이 달라지며, 늦게 처리된 유닛은 다른 slot을 받음. 설계상 의도된 동작이나, 극단적 상황에서 시각적 겹침·밀림 가능 | 낮음 |
| **holdPos vs shouldRest** | `shouldRest`가 `restX`/`restY`를 갱신한 뒤 `settleInfantryToSubslot`가 subslot으로 끌어당김. 현재는 `restX=u.x` 기반이라 서로 충돌하지 않음 | 없음 |

### 3.2 탱크 (중간)

| 이슈 | 설명 | 심각도 |
|-----|------|--------|
| **동일 타일 다수 도착** | 여러 탱크가 같은 최종 타일로 도착 시 모두 정확히 같은 좌표로 스냅되어 겹침. 이후 회피 로직은 `followPath` 이동 중에만 적용되어, idle 상태에서는 겹친 채로 유지됨 | 낮음 |
| **holdPos = false** | 탱크 도착 시 `holdPos = false`로 설정. path가 null이면 이동 로직이 아예 실행되지 않아 실제 문제는 없음 | 없음 |

### 3.3 코드 품질

| 이슈 | 설명 | 수정 |
|-----|------|------|
| **settleInfantryToSubslot 중복** | sim.js에 동일 함수가 두 번 정의됨. 후자가 전자를 덮어써서 사용됨. | ✅ 중복 정의 제거됨 |

---

## 4. 수정 사항 (적용됨)

1. **settleInfantryToSubslot 중복 제거**: 첫 번째 정의 삭제
2. **occInf > 4 시 subSlot 정리**: 과포화로 타일 중심 강제 이동 시 `subSlot`, `subSlotTx`, `subSlotTy`를 null로 초기화하여 상태 일관성 유지

---

## 5. 처리 순서 (같은 프레임 내)

1. `clearOcc` → occupancy/mask 초기화
2. 유닛 루프:
   - 이전 유닛이 타일을 옮겼으면 `updateOccForUnitMove` 호출
   - `_occOldTx` / `_occOldTy` 갱신
   - `shouldRest` (idle/guard, target 없음)
   - order type별 분기 → `followPath` 호출
   - 보병 한정 `settleInfantryToSubslot` 호출

---

## 6. 결론 및 권장사항

- 보병·탱크 모두 웨이포인트 도착 후 안착 로직이 존재하며, 일반적인 경우에는 정상 동작함.
- 보병:
  - `occInf > 4`인 경우 subslot 대신 중심 고정으로 인한 궤적 불일치 가능성 있음.
  - 필요 시 `occInf > 4`에서도 subslot을 갱신하거나, 안착 후 subslot 재할당 로직을 추가 검토할 수 있음.
- 탱크:
  - 여러 유닛이 동일 타일을 목표로 할 때 겹침은 의도된 동작에 가깝고, 과도한 겹침이 문제라면 별도 spreading 로직을 고려할 수 있음.
- sim.js의 `settleInfantryToSubslot` 중복 정의는 제거해도 무방함.
