/* locale.js - 인게임 텍스트 로컬라이징 (ko/en/ja)
 * C&C 스타일 영어, 일본어 번역
 */
(function(){
  const STORAGE_KEY = "ou_lang";
  const LOCALE = {
    ko: {
      // 유닛/건물
      "unit.hq":"건설소(HQ)", "unit.power":"발전소", "unit.refinery":"정제소", "unit.barracks":"막사",
      "unit.factory":"군수공장", "unit.radar":"레이더", "unit.turret":"터렛",
      "unit.infantry":"보병", "unit.engineer":"엔지니어", "unit.sniper":"저격병", "unit.tank":"경전차",
      "unit.ifv":"IFV", "unit.harvester":"굴착기",
      // 토스트
      "toast.resume":"재개", "toast.repairMode":"수리 모드", "toast.repairOff":"수리 해제",
      "toast.sellMode":"매각 모드", "toast.sellOff":"매각 해제", "toast.repairSellOff":"수리/매각 해제",
      "toast.repairOnly":"건물만 수리 가능", "toast.repairCant":"수리 불가", "toast.repairUnneeded":"수리 불필요",
      "toast.sellCant":"매각 불가", "toast.noTarget":"대상 없음", "toast.hqSet":"주요건물 지정",
      "toast.cantOrder":"명령을 따를 수 없습니다. 건설 중입니다", "toast.alreadyQueued":"이미 건설 대기중",
      "toast.cancelRefund":"취소 + 환불", "toast.reserveCancel":"예약 취소", "toast.wait":"대기",
      "toast.sell":"매각", "toast.repairStart":"수리 시작", "toast.repairCancel":"수리 취소",
      "toast.boarded":"탑승", "toast.unboard":"하차", "toast.alreadyBoarded":"이미 탑승중",
      "toast.noInfNear":"탑승할 보병이 근처에 없음", "toast.noUnloadSpace":"하차할 공간이 없습니다",
      "toast.attackSet":"공격 지정", "toast.ifvRepair":"IFV 수리",
      "toast.noProducer":"생산 건물이 없습니다", "toast.noUnits":"선택한 유닛이 없음",
      "toast.underAttackHarvester":"광물굴착기가 공격 당합니다!", "toast.underAttackBase":"아군기지가 공격 당합니다!",
      "toast.noRecentAttack":"최근 공격 이벤트 없음", "toast.moveToAttack":"최근 피격 지점으로 이동",
      "toast.victory":"승리!", "toast.defeat":"패배...", "toast.runtimeError":"런타임 오류로 중지됨 (콘솔 확인)",
      // UI
      "ui.radarOnline":"RADAR ONLINE", "ui.radarRequired":"RADAR REQUIRED", "ui.nothingSelected":"아무것도 선택 안 됨",
      "ui.selected":"선택됨", "ui.selectCount":"개 선택", "ui.minimapActive":"미니맵 활성",
      "ui.repair":"수리", "ui.sell":"매각", "ui.build":"건설", "ui.repairD":"수리(D)", "ui.sellD":"매각(D)",
      "ui.main":"메인", "ui.def":"방어", "ui.inf":"보병", "ui.veh":"기갑", "ui.production":"생산",
      "ui.minimap":"미니맵", "ui.selectionInfo":"선택 정보", "ui.primary":"주요", "ui.reserve":"예약",
      "ui.ready":"READY", "ui.power":"전력", "ui.options":"옵션", "ui.play":"재생", "ui.shuffle":"셔플",
      "ui.pmResume":"게임 돌아가기", "ui.pmExit":"게임 종료",
      "ui.repeatAll":"반복: 전체", "ui.repeatOne":"반복: 1곡", "ui.repeatOff":"반복: 없음",
      "ui.shuffleOn":"셔플: ON", "ui.shuffleOff":"셔플: OFF",
      // 프리게임
      "pregame.skirmish":"스커미시 게임", "pregame.sub":"진영 컬러 / 맵 스타트 지점을 선택하고 시작하세요.",
      "pregame.playerColor":"플레이어 컬러", "pregame.enemyColor":"적 컬러", "pregame.map":"맵",
      "pregame.initialMoney":"초기 자금", "pregame.moneyHint":"선택한 금액으로 아군/적군 둘 다 시작",
      "pregame.fogOff":"디버깅용 전장안개 OFF (전맵 밝힘)", "pregame.fogHint":"체크하면 전장안개/미탐지 영역 어둡게 표시를 끄고, 맵 전체를 항상 밝게 표시합니다.",
      "pregame.fastProd":"디버깅: 아군 모든 생산/건설 1초 완료", "pregame.fastProdHint":"적군은 영향 없음",
      "pregame.shortGame":"짧은 게임", "pregame.shortGameHint":"적군 건물을 모두 파괴하면 적 유닛 전멸 + 즉시 승리",
      "pregame.mapHint":"썸네일의 번호를 클릭해 스타트 지점 선택", "pregame.start":"시작",
      "pregame.loading":"LOADING...",
      // 결과
      "result.victory":"승리!", "result.defeat":"패배...", "result.time":"시간", "result.player":"플레이어",
      "result.computer":"컴퓨터", "result.mvp":"MVP",
      "mvp.cupRamen":"컵라면 뚝딱!", "mvp.cupRamenDesc":"3분 만에 승리",
      "mvp.fiveMin":"5분 순삭", "mvp.fiveMinDesc":"5분 만에 승리",
      "mvp.engineerCaptures":"너희 기지 다 내꺼다요", "mvp.engineerCapturesDesc":"가장 많은 적 건물 엔지니어 점령",
      "mvp.sniperKills":"안되겠소 쏩시다!", "mvp.sniperKillsDesc":"가장 많은 적 보병을 저격병/저격IFV로 처치",
      "mvp.vehicleKills":"탱크헌터", "mvp.vehicleKillsDesc":"가장 많은 적 기갑유닛 처치",
      "mvp.armorProduced":"몽땅 쓸어주마", "mvp.armorProducedDesc":"가장 많은 기갑 공격유닛 생산",
      "mvp.infantryProduced":"고기분쇄기", "mvp.infantryProducedDesc":"가장 많은 보병 생산",
      "mvp.turretBuilt":"철의 장막", "mvp.turretBuiltDesc":"가장 많은 방어시설 건설"
    },
    en: {
      "unit.hq":"Construction Yard (HQ)", "unit.power":"Power Plant", "unit.refinery":"Refinery", "unit.barracks":"Barracks",
      "unit.factory":"War Factory", "unit.radar":"Radar", "unit.turret":"Turret",
      "unit.infantry":"Infantry", "unit.engineer":"Engineer", "unit.sniper":"Sniper", "unit.tank":"Light Tank",
      "unit.ifv":"IFV", "unit.harvester":"Harvester",
      "toast.resume":"Resumed", "toast.repairMode":"Repair mode", "toast.repairOff":"Repair cancelled",
      "toast.sellMode":"Sell mode", "toast.sellOff":"Sell cancelled", "toast.repairSellOff":"Repair/Sell cancelled",
      "toast.repairOnly":"Buildings only", "toast.repairCant":"Cannot repair", "toast.repairUnneeded":"Repairs not needed",
      "toast.sellCant":"Cannot sell", "toast.noTarget":"No target", "toast.hqSet":"Primary building set",
      "toast.cantOrder":"Unable to comply, building in progress", "toast.alreadyQueued":"Already queued",
      "toast.cancelRefund":"Cancelled + refunded", "toast.reserveCancel":"Queue cancelled", "toast.wait":"On hold",
      "toast.sell":"Sold", "toast.repairStart":"Repairing", "toast.repairCancel":"Repair cancelled",
      "toast.boarded":"Boarded", "toast.unboard":"Unloaded", "toast.alreadyBoarded":"Already boarded",
      "toast.noInfNear":"No infantry nearby", "toast.noUnloadSpace":"No space to unload",
      "toast.attackSet":"Attack target set", "toast.ifvRepair":"IFV repair",
      "toast.noProducer":"No production facility", "toast.noUnits":"No units selected",
      "toast.underAttackHarvester":"Harvester under attack!", "toast.underAttackBase":"Base under attack!",
      "toast.noRecentAttack":"No recent attack", "toast.moveToAttack":"Moving to last attack",
      "toast.victory":"Victory!", "toast.defeat":"Defeat...", "toast.runtimeError":"Runtime error (check console)",
      "ui.radarOnline":"RADAR ONLINE", "ui.radarRequired":"RADAR REQUIRED", "ui.nothingSelected":"Nothing selected",
      "ui.selected":"Selected", "ui.selectCount":" selected", "ui.minimapActive":"Minimap active",
      "ui.repair":"Repair", "ui.sell":"Sell", "ui.build":"Build", "ui.repairD":"Repair(D)", "ui.sellD":"Sell(D)",
      "ui.main":"Main", "ui.def":"Defense", "ui.inf":"Infantry", "ui.veh":"Vehicles", "ui.production":"Production",
      "ui.minimap":"Minimap", "ui.selectionInfo":"Selection", "ui.primary":"Primary", "ui.reserve":"Queued",
      "ui.ready":"READY", "ui.power":"Power", "ui.options":"Options", "ui.play":"Play", "ui.shuffle":"Shuffle",
      "ui.pmResume":"Back to game", "ui.pmExit":"Exit game",
      "ui.repeatAll":"Repeat: All", "ui.repeatOne":"Repeat: One", "ui.repeatOff":"Repeat: Off",
      "ui.shuffleOn":"Shuffle: ON", "ui.shuffleOff":"Shuffle: OFF",
      "pregame.skirmish":"Skirmish", "pregame.sub":"Select team colors and map start position.",
      "pregame.playerColor":"Player color", "pregame.enemyColor":"Enemy color", "pregame.map":"Map",
      "pregame.initialMoney":"Starting credits", "pregame.moneyHint":"Both teams start with selected amount",
      "pregame.fogOff":"Debug: Fog of war OFF", "pregame.fogHint":"Reveal entire map.",
      "pregame.fastProd":"Debug: Instant build/produce", "pregame.fastProdHint":"Enemy unaffected",
      "pregame.shortGame":"Short game", "pregame.shortGameHint":"Destroy all enemy buildings to win instantly",
      "pregame.mapHint":"Click numbers to select start position", "pregame.start":"Start",
      "pregame.loading":"LOADING...",
      "result.victory":"Victory!", "result.defeat":"Defeat...", "result.time":"Time", "result.player":"Player",
      "result.computer":"Computer", "result.mvp":"MVP",
      "mvp.cupRamen":"Cup Noodle!", "mvp.cupRamenDesc":"Victory in 3 minutes",
      "mvp.fiveMin":"Five-minute rush", "mvp.fiveMinDesc":"Victory in 5 minutes",
      "mvp.engineerCaptures":"All your base are belong to us!", "mvp.engineerCapturesDesc":"Most buildings captured by engineer",
      "mvp.sniperKills":"Sniper elite", "mvp.sniperKillsDesc":"Most infantry kills by sniper/IFV",
      "mvp.vehicleKills":"Wunderbar!", "mvp.vehicleKillsDesc":"Most vehicle kills",
      "mvp.armorProduced":"Armored assault", "mvp.armorProducedDesc":"Most armor units produced",
      "mvp.infantryProduced":"Meat grinder", "mvp.infantryProducedDesc":"Most infantry produced",
      "mvp.turretBuilt":"Iron curtain", "mvp.turretBuiltDesc":"Most turrets built"
    },
    ja: {
      "unit.hq":"建設所(HQ)", "unit.power":"発電所", "unit.refinery":"精製所", "unit.barracks":"兵舎",
      "unit.factory":"軍需工場", "unit.radar":"レーダー", "unit.turret":"タレット",
      "unit.infantry":"歩兵", "unit.engineer":"エンジニア", "unit.sniper":"スナイパー", "unit.tank":"軽戦車",
      "unit.ifv":"IFV", "unit.harvester":"採掘車",
      "toast.resume":"再開", "toast.repairMode":"修理モード", "toast.repairOff":"修理解除",
      "toast.sellMode":"売却モード", "toast.sellOff":"売却解除", "toast.repairSellOff":"修理/売却解除",
      "toast.repairOnly":"建物のみ修理可能", "toast.repairCant":"修理不可", "toast.repairUnneeded":"修理不要",
      "toast.sellCant":"売却不可", "toast.noTarget":"対象なし", "toast.hqSet":"主要建物指定",
      "toast.cantOrder":"建設中につき指示に従えません", "toast.alreadyQueued":"既に建設待機中",
      "toast.cancelRefund":"キャンセル＋返金", "toast.reserveCancel":"予約キャンセル", "toast.wait":"待機",
      "toast.sell":"売却", "toast.repairStart":"修理開始", "toast.repairCancel":"修理キャンセル",
      "toast.boarded":"搭乗", "toast.unboard":"降車", "toast.alreadyBoarded":"既に搭乗中",
      "toast.noInfNear":"近くに歩兵がいません", "toast.noUnloadSpace":"降車スペースがありません",
      "toast.attackSet":"攻撃目標指定", "toast.ifvRepair":"IFV修理",
      "toast.noProducer":"生産施設がありません", "toast.noUnits":"ユニットが選択されていません",
      "toast.underAttackHarvester":"採掘車が攻撃されています!", "toast.underAttackBase":"味方拠点が攻撃されています!",
      "toast.noRecentAttack":"直近の攻撃イベントなし", "toast.moveToAttack":"最後の被弾地点へ移動",
      "toast.victory":"勝利!", "toast.defeat":"敗北...", "toast.runtimeError":"ランタイムエラー（コンソール確認）",
      "ui.radarOnline":"RADAR ONLINE", "ui.radarRequired":"RADAR REQUIRED", "ui.nothingSelected":"未選択",
      "ui.selected":"選択中", "ui.selectCount":"体選択", "ui.minimapActive":"ミニマップ有効",
      "ui.repair":"修理", "ui.sell":"売却", "ui.build":"建設", "ui.repairD":"修理(D)", "ui.sellD":"売却(D)",
      "ui.main":"メイン", "ui.def":"防御", "ui.inf":"歩兵", "ui.veh":"機甲", "ui.production":"生産",
      "ui.minimap":"ミニマップ", "ui.selectionInfo":"選択情報", "ui.primary":"主要", "ui.reserve":"予約",
      "ui.ready":"READY", "ui.power":"電力", "ui.options":"オプション", "ui.play":"再生", "ui.shuffle":"シャッフル",
      "ui.pmResume":"ゲームに戻る", "ui.pmExit":"ゲーム終了",
      "ui.repeatAll":"リピート: 全曲", "ui.repeatOne":"リピート: 1曲", "ui.repeatOff":"リピート: なし",
      "ui.shuffleOn":"シャッフル: ON", "ui.shuffleOff":"シャッフル: OFF",
      "pregame.skirmish":"スカーミッシュ", "pregame.sub":"陣営カラーとマップ開始地点を選択してください。",
      "pregame.playerColor":"プレイヤーカラー", "pregame.enemyColor":"敵カラー", "pregame.map":"マップ",
      "pregame.initialMoney":"初期資金", "pregame.moneyHint":"選択した金額で両軍が開始",
      "pregame.fogOff":"デバッグ: 戦場の霧 OFF", "pregame.fogHint":"マップ全体を常に表示します。",
      "pregame.fastProd":"デバッグ: 即時建設/生産", "pregame.fastProdHint":"敵には影響なし",
      "pregame.shortGame":"ショートゲーム", "pregame.shortGameHint":"敵建物全破壊で即勝利",
      "pregame.mapHint":"番号をクリックして開始地点を選択", "pregame.start":"開始",
      "pregame.loading":"LOADING...",
      "result.victory":"勝利!", "result.defeat":"敗北...", "result.time":"時間", "result.player":"プレイヤー",
      "result.computer":"コンピュータ", "result.mvp":"MVP",
      "mvp.cupRamen":"カップ麺", "mvp.cupRamenDesc":"3分で勝利",
      "mvp.fiveMin":"5分あれば十分", "mvp.fiveMinDesc":"5分で勝利",
      "mvp.engineerCaptures":"拠点占拠王", "mvp.engineerCapturesDesc":"最多建物エンジニア占拠",
      "mvp.sniperKills":"こいつは黒酢アイスを食べた!!", "mvp.sniperKillsDesc":"最多歩兵キル（スナイパー/IFV）",
      "mvp.vehicleKills":"やわらか戦車", "mvp.vehicleKillsDesc":"最多機甲ユニット撃破",
      "mvp.armorProduced":"戦車道行進曲", "mvp.armorProducedDesc":"最多機甲ユニット生産",
      "mvp.infantryProduced":"戦いは数だよ兄貴！", "mvp.infantryProducedDesc":"最多歩兵生産",
      "mvp.turretBuilt":"左舷、弾幕薄いぞ！ 何やってんの！", "mvp.turretBuiltDesc":"最多タレット建設"
    }
  };

  let _lang = "ko";
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && LOCALE[s]) _lang = s;
  } catch(_e){}

  const L = function(key){
    const m = LOCALE[_lang] || LOCALE.ko;
    return m[key] != null ? m[key] : (LOCALE.ko[key] || key);
  };

  L.setLang = function(lang){
    if (LOCALE[lang]){ _lang = lang; try{ localStorage.setItem(STORAGE_KEY, lang); }catch(_e){} return true; }
    return false;
  };
  L.getLang = function(){ return _lang; };
  L.LOCALE = LOCALE;

  // NAME_KO 호환: L.unit(kind) → 현재 언어 유닛/건물명
  const UNIT_KEYS = ["hq","power","refinery","barracks","factory","radar","turret","infantry","engineer","sniper","tank","ifv","harvester"];
  L.unit = function(kind){
    if (!kind) return "";
    const k = "unit." + kind;
    const v = L(k);
    return v !== k ? v : String(kind);
  };

  window.OULocale = { L, LOCALE };
})();
