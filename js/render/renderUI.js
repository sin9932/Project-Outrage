function $(id){ return document.getElementById(id); }

export function renderUI(state){
  const moneyEl = $("money");
  const selCount = $("selCount");
  const selInfo = $("selInfo");
  const toast = $("toast");

  if(moneyEl) moneyEl.textContent = `$ ${Math.floor(state.players.self.money).toLocaleString()}`;
  if(selCount) selCount.textContent = `${state.ui.selected.size}`;

  if(selInfo){
    if(state.ui.selected.size === 0){
      selInfo.textContent = "아무것도 선택 안 됨";
    }else{
      selInfo.textContent = `선택: ${[...state.ui.selected].slice(0,3).join(", ")}${state.ui.selected.size>3?"...":""}`;
    }
  }

  if(toast){
    const now = performance.now();
    if(state.ui.toast.until > now){
      toast.style.display = "block";
      toast.style.opacity = "1";
      toast.textContent = state.ui.toast.text || "";
    }else{
      toast.style.opacity = "0";
      toast.style.display = "none";
    }
  }
}
