const socket = io();

socket.on("auction:state", render);

fetch("/api/public/state").then(r=>r.json()).then(render);

function render(state) {
  const a = state.auction || {};
  document.getElementById("currentBid").textContent = a.currentBid || 0;
  document.getElementById("highestTeam").textContent = a.highestTeam || "—";

  document.getElementById("teams").innerHTML = (state.teams || []).map(t => `
    <div class="team-row">
      <div><b>${esc(t.code)}</b> ${esc(t.name)}</div>
      <strong>${t.remainingPoints}</strong>
      <small>${t.playerCount}/${t.maxPlayers}</small>
    </div>
  `).join("");

  const p = state.currentPlayer;
  const card = document.getElementById("playerCard");

  if (!p) {
    card.className = "player-card empty";
    card.innerHTML = `<div class="empty-text">${a.status === "SOLD" ? "PLAYER SOLD" : "AUCTION WILL START SOON"}</div>`;
  } else {
    card.className = "player-card";
    card.innerHTML = `
      <div class="photo-wrap"><img src="${p.photoUrl}" alt=""></div>
      <div class="player-info">
        <div class="auction-tag">${a.status === "LIVE" ? "🔴 BIDDING LIVE" : a.status}</div>
        <h1>${esc(p.name)}</h1>
        <div class="role">${esc(p.role)}</div>
        <div class="details">
          <span>📍 ${esc(p.village)}</span>
        </div>
        <div class="price-grid">
          <div><small>BASE PRICE</small><b>${a.baseBid}</b></div>
          <div><small>CURRENT BID</small><b>${a.currentBid || a.baseBid}</b></div>
          <div><small>HIGHEST BIDDER</small><b>${esc(a.highestTeam || "—")}</b></div>
        </div>
      </div>
    `;
  }

  document.getElementById("history").innerHTML =
    (a.bidHistory || []).slice().reverse().map(b => `
      <div class="history-row">
        <b>${b.amount}</b>
        <span>${esc(b.team)}</span>
        <small>${new Date(b.at).toLocaleTimeString()}</small>
      </div>
    `).join("") || `<div class="muted">No bids yet</div>`;

  document.getElementById("players").innerHTML = (state.players || []).map(p => `
    <tr>
      <td><img class="thumb" src="${p.photoUrl}"></td>
      <td><b>${esc(p.name)}</b></td>
      <td>${esc(p.role)}</td>
      <td>${esc(p.village)}</td>
      <td><span class="status ${p.status.toLowerCase()}">${p.status}</span></td>
      <td>${p.status === "SOLD" ? `${esc(p.soldTeam)} • ${p.soldPoints}` : "—"}</td>
    </tr>
  `).join("");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
