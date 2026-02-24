# AI 로직 충돌 검토 결과

## 실행 순서 (aiTick)

1. aiPickRally
2. aiTryPlaceReady
3. aiEnsureTechAndEco
4. aiPlaceDefenseIfRich
5. aiQueueUnits
6. **aiUseIFVPassengers** (IFV 탑승, 엔지니어-IFV 하라스먼트, 저격-IFV)
7. aiParkEmptyIFVs
8. aiUnstickEngineers
9. **aiEngineerRush** (18~26초마다)
10. aiEmergencyDefend
11. 저격병 블록
12. rushDefense → aiCommandMoveToRally
13. ... 메인 로직 (웨이브, 엔지니어 하라스먼트, 하라스먼트 스쿼드, rally/attack 등)

---

## 충돌 없음 (의도된 동작)

### 1. aiCommandAttackWave
- **엔지니어-IFV 제외**: `if (u.kind === "ifv" && u.passengerId && u.passKind === "engineer") continue;`
- 정면 공격 웨이브 시 엔지니어-IFV 하라스먼트 유지

### 2. aiCommandMoveToRally "pull strays"
- `combat.filter(u => !u.order || u.order.type !== "move")` → `order.type === "move"`인 유닛 제외
- 엔지니어-IFV는 `move`(dock) 명령을 가지므로 **제외됨** → 하라스먼트 유지

### 3. rushDefense / infRushThreat / poor / threat
- aiCommandMoveToRally로 전원 집결 → 방어 상황에서 의도된 오버라이드

### 4. Tank/IFV 웨이브 (line 942~963)
- IFV에 대해 `if (!u.passengerId)` 일 때만 attackmove 부여
- 엔지니어-IFV(passengerId 있음)는 웨이브 명령을 받지 않음 → 하라스먼트 유지

### 5. aiParkEmptyIFVs vs aiUseIFVPassengers
- `_pickupTargetId`가 있으면 aiParkEmptyIFVs에서 스킵 → 픽업 중인 빈 IFV는 그대로 유지

---

## 잠재적 중복 (충돌 아님)

### aiEngineerRush vs aiUseIFVPassengers
- **실행 순서**: aiUseIFVPassengers → aiEngineerRush (같은 틱)
- **동작**: 18~26초마다 aiEngineerRush가 엔지니어-IFV에 `attackmove → phq` 부여
- **다음 틱**: aiUseIFVPassengers가 다시 `move → dock`으로 덮어씀
- **결과**: 18~26초마다 한 틱만 `attackmove`가 적용되고, 곧바로 `move → dock`으로 복귀
- **평가**: 둘 다 phq 방향으로 보내는 목적이라 큰 충돌은 아님. aiEngineerRush는 “가끔 킥” 역할로 보임. 제거해도 되고, 유지해도 무방.

---

## 결론

**현재 AI 로직 간 명확한 충돌은 없음.**

- 엔지니어-IFV 하라스먼트는 aiCommandAttackWave, pull strays, Tank/IFV 웨이브에서 보호됨
- 방어/긴급 상황에서만 의도적으로 오버라이드
- aiEngineerRush는 약간의 중복이 있으나, 치명적인 충돌은 아님
