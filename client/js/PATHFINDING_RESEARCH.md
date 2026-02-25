# 길찾기 최적화: Flow Field 연구

## 1. 현재 구현 (A*)

### 구조
- **위치**: `sim.js` - `aStarPath`, `aStarPathOcc`
- **타일 기반**: `MAP_W × MAP_H` 그리드, 8방향 이동
- **유닛별 경로**: `setPathTo(u, goalX, goalY)` → `aStarPathOcc(u, sx, sy, gx, gy)`
- **예산**: `MAX_PATHFINDS_PER_FRAME = 32`, `MAX_ASTAR_EXPAND = 900`

### 특징
- **aStarPath**: 정적 장애물만 고려 (건물, 지형)
- **aStarPathOcc**: 동적 점유(occAll, canEnterTile, isReservedByOther) 반영
- 유닛마다 개별 경로 계산 → 같은 목표로 이동하는 군집이면 N번 A* 호출

### 한계
- **군집 이동**: 50유닛이 같은 목표 → 50번 경로 계산 (프레임당 32회 제한으로 분산)
- **지연**: 경로 대기 중 유닛이 멈춤
- **메모리**: 유닛당 path 배열 보관

---

## 2. Flow Field 개요

### 개념
목표 타일에서 **역방향으로** 모든 타일에 대한 "목표까지의 거리"를 한 번 계산하고,  
각 타일에서 **가장 가까운 이웃** 방향을 저장해 두면,  
**같은 목표로 가는 모든 유닛이 이 필드만 보고 이동**할 수 있다.

```
목표(G)에서 시작해 BFS/다익스트라로 모든 타일에 cost 전파
→ 각 타일 (tx,ty)에 cost[tx,ty] = 목표까지 최단 거리
→ 각 타일에서 cost가 감소하는 방향 = 이동 방향 (flow vector)
```

### 알고리즘 (2단계)

#### Phase 1: Integration Field (비용 전파)
```
1. cost[gx][gy] = 0 (목표)
2. BFS 또는 Dijkstra로 인접 타일 확장
   - cost[nx][ny] = cost[cx][cy] + 이동비용
   - 장애물/점유 타일은 무한대 또는 스킵
3. 모든 도달 가능 타일에 cost 할당
```

#### Phase 2: Flow Vector (방향 계산)
```
각 타일 (tx,ty)에서:
  - 8방향 이웃 중 cost가 가장 작은 방향 선택
  - flow[tx][ty] = (dx, dy) 단위 벡터
```

#### Phase 3: 이동
```
유닛 u가 (wx, wy)에 있으면:
  tx = floor(wx / TILE), ty = floor(wy / TILE)
  (dx, dy) = flow[tx][ty]
  u.vx += dx * speed
  u.vy += dy * speed
```

### 장점
| 항목 | A* (현재) | Flow Field |
|------|-----------|------------|
| 군집 이동 | 유닛당 1회 A* | 목표당 1회 필드 계산 |
| 메모리 | 유닛당 path[] | 맵당 cost[], flow[] (고정) |
| 확장성 | O(유닛수 × 노드수) | O(맵크기) + O(유닛수) 이동만 |
| 자연스러움 | 경로 따라 이동 | 필드 따라 부드럽게 이동 |

### 단점
| 항목 | Flow Field |
|------|------------|
| 목표 변경 | 필드 전체 재계산 |
| 동적 장애물 | 필드 갱신 빈도 필요 |
| 유닛 점유 | 필드에 반영하려면 주기적 재계산 또는 별도 회피 |
| 목표 여러 개 | 목표별 필드 필요 (캐싱) |

---

## 3. RTS에서의 Flow Field 활용

### 적합한 상황
- **군집 이동**: 같은 목표로 많은 유닛 이동 (공격, 수비, 집결)
- **목표가 상대적으로 고정**: 한 번 계산한 필드를 여러 프레임 사용
- **맵 크기 제한**: 32×32 ~ 128×128 수준

### 부적합한 상황
- **유닛별 상이한 목표**: 하베스터(광석), 공격 유닛(적) 등
- **목표가 자주 바뀜**: 실시간 추적 등
- **좁은 통로**: Flow Field는 넓은 공간에서 효과적

### 하이브리드 전략
- **군집 명령**: Flow Field 사용
- **개별 명령**: 기존 A* 유지
- **판단 기준**: 같은 (gTx, gTy)로 이동하는 유닛 수 ≥ K (예: 5)이면 Flow Field

---

## 4. 구현 시 고려사항 (Project Outrage)

### 맵 크기
- `MAP_W`, `MAP_H` (예: 32×32) → cost/flow 배열 1024 타일
- `Int16Array` 또는 `Uint16Array`로 cost 저장 가능

### 동적 점유
- `occAll`, `canEnterTile`, `isReservedByOther` 등
- **옵션 A**: Flow Field 계산 시 현재 점유 반영 (필드 갱신 시점 스냅샷)
- **옵션 B**: Flow Field는 정적 장애물만, 유닛 간 회피는 `resolveUnitOverlaps` 등으로 처리 (현재 방식 유지)

### 목표 캐싱
- `(gTx, gTy)` + 맵 상태 해시를 키로 Flow Field 캐시
- 맵 변경(건물 파괴 등) 시 해당 필드 무효화

### 이동 방식
- **현재**: path[]의 타일 순서대로 이동
- **Flow Field**: `flow[tx][ty]` 방향으로 연속 이동 (타일 경계에 덜 구속됨)

### 기존 `followPath`와의 통합
- `u.path`가 있으면 기존 로직
- `u.flowGoal`이 있으면 Flow Field 기반 이동
- `setPathTo`에서 "군집 이동" 감지 시 Flow Field 경로 설정

---

## 5. 참고 자료

- **Dijkstra Grids / Flow Fields** (Red Blob Games)
  - https://www.redblobgames.com/pathfinding/tower-defense/
- **Flow Field Pathfinding** (GDC, Supreme Commander 2)
- **RTS Pathfinding: Flow Fields vs A*** (일반 비교 글 다수)

---

## 6. 구현 완료 (로드맵)

1. **Phase 1** ✅ `flowField.js` 모듈
   - `OUFlowField.computeFlowField(gTx, gTy, MAP_W, MAP_H, isWalkableTile, inMap)` → `{ cost, flow }`
   - `OUFlowField.getFlowAt(field, wx, wy, TILE, tileOfX, tileOfY)` → `{ dx, dy }`
2. **Phase 2** ✅ 군집 이동 감지
   - `assignFlowFieldToGroups()`: 같은 목표(5+ 유닛) 그룹에 Flow Field 적용
   - 차량(cls==="veh")만 Flow 사용
3. **Phase 3** ✅ `followPath`와 병행
   - `u.flowGoal` 있을 때 `followFlowPath(u, dt)` 호출
   - 기존 path 기반 이동 유지
