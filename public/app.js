/* =========================================================
   SGPPL-2 LIVE AUCTION
   PUBLIC AUCTION PAGE
   ========================================================= */

const socket = io();


/* =========================================================
   INITIAL STATE
========================================================= */

socket.on("auction:state", render);


fetch("/api/public/state")
  .then(response => response.json())
  .then(state => render(state))
  .catch(error => {
    console.error("Unable to load auction state:", error);
  });



/* =========================================================
   MAIN RENDER
========================================================= */

function render(state) {

  const auction = state.auction || {};


  /* =======================================================
     BID
  ======================================================== */

  const currentBid =
    document.getElementById("currentBid");

  const highestTeam =
    document.getElementById("highestTeam");


  if (currentBid) {

    currentBid.textContent =
      Number(auction.currentBid || 0).toLocaleString("en-IN");

  }


  if (highestTeam) {

    highestTeam.textContent =
      auction.highestTeam || "—";

  }



  /* =======================================================
     TEAMS
  ======================================================== */

  const teamsContainer =
    document.getElementById("teams");


  if (teamsContainer) {

    teamsContainer.innerHTML =
      (state.teams || []).map(team => {

        const remaining =
          Number(team.remainingPoints || 0)
            .toLocaleString("en-IN");


        return `

          <div class="team-row">

            <div>
              <b>${esc(team.code)}</b>
              ${esc(team.name)}
            </div>

            <strong>
              ₹${remaining}
            </strong>

            <small>
              ${team.playerCount || 0}/${team.maxPlayers || 25}
              players
            </small>

          </div>

        `;

      }).join("");

  }



  /* =======================================================
     CURRENT PLAYER
  ======================================================== */

  const playerCard =
    document.getElementById("playerCard");


  const player =
    state.currentPlayer;


  if (!playerCard) {
    return;
  }



  /* =======================================================
     NO CURRENT PLAYER
  ======================================================== */

  if (!player) {

    playerCard.className =
      "current-player-card empty";


    const auctionMessage =
      auction.status === "SOLD"
        ? "PLAYER SOLD"
        : auction.status === "UNSOLD"
          ? "PLAYER UNSOLD"
          : "AUCTION IS READY";


    playerCard.innerHTML = `

      <div class="empty-auction">

        <div class="empty-auction-icon">
          🏏
        </div>

        <h1>
          ${auctionMessage}
        </h1>

        <p>
          Waiting for the next player
        </p>

        <div class="waiting-badge">
          ${esc(auction.status || "WAITING")}
        </div>

      </div>

    `;

    return;

  }



  /* =======================================================
     CURRENT PLAYER CARD
  ======================================================== */

  playerCard.className =
    "current-player-card";


  const status =
    auction.status || "LIVE";


  const current =
    Number(auction.currentBid || 0);


  const base =
    Number(auction.baseBid || 50);


  const displayBid =
    current > 0
      ? current
      : base;


  playerCard.innerHTML = `

    <div class="photo-wrap">

      <img
        src="${esc(player.photoUrl)}"
        alt="${esc(player.name)}"
        loading="eager"
        onerror="this.style.display='none'"
      >

    </div>


    <div class="player-info">

      <div class="auction-tag">
        ${status === "LIVE"
          ? "🔴 BIDDING LIVE"
          : esc(status)}
      </div>


      <h1>
        ${esc(player.name)}
      </h1>


      <div class="role">
        ${esc(player.role)}
      </div>


      <div class="details">
        📍 ${esc(player.village)}
      </div>


      <div class="price-grid">

        <div>

          <small>
            BASE PRICE
          </small>

          <b>
            ₹${base.toLocaleString("en-IN")}
          </b>

        </div>


        <div>

          <small>
            CURRENT BID
          </small>

          <b>
            ₹${displayBid.toLocaleString("en-IN")}
          </b>

        </div>


        <div>

          <small>
            HIGHEST BIDDER
          </small>

          <b>
            ${esc(auction.highestTeam || "—")}
          </b>

        </div>

      </div>

    </div>

  `;



  /* =======================================================
     BID HISTORY
  ======================================================== */

  const historyContainer =
    document.getElementById("history");


  if (historyContainer) {

    const history =
      (auction.bidHistory || [])
        .slice()
        .reverse();


    if (!history.length) {

      historyContainer.innerHTML = `

        <div class="empty-history">

          <div class="history-icon">
            📊
          </div>

          <strong>
            No bids yet
          </strong>

          <span>
            Bidding activity will appear here
          </span>

        </div>

      `;

    } else {

      historyContainer.innerHTML =
        history.map(bid => {

          const amount =
            Number(bid.amount || 0)
              .toLocaleString("en-IN");


          let time = "";

          try {

            time =
              new Date(bid.at)
                .toLocaleTimeString(
                  "en-IN",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  }
                );

          } catch (error) {

            time = "";

          }


          return `

            <div class="history-row">

              <b>
                ₹${amount}
              </b>

              <span>
                ${esc(bid.team)}
              </span>

              <small>
                ${time}
              </small>

            </div>

          `;

        }).join("");

    }

  }



  /* =======================================================
     PLAYER LIST
  ======================================================== */

  const playersContainer =
    document.getElementById("players");


  if (!playersContainer) {
    return;
  }


  const players =
    state.players || [];


  playersContainer.innerHTML =
    players.map((player, index) => {

      const statusClass =
        String(player.status || "")
          .toLowerCase();


      let result = "—";


      if (player.status === "SOLD") {

        result = `

          <strong>
            ${esc(player.soldTeam || "")}
          </strong>

          <br>

          <small>
            ₹${Number(player.soldPoints || 0)
              .toLocaleString("en-IN")}
          </small>

        `;

      }


      return `

        <tr>

          <td>
            <strong>
              ${index + 1}
            </strong>
          </td>


          <td>

            <div
              style="
                display:flex;
                align-items:center;
                gap:8px;
              "
            >

              <img
                class="thumb"
                src="${esc(player.photoUrl)}"
                alt=""
                loading="lazy"
                onerror="this.style.display='none'"
              >

              <strong>
                ${esc(player.name)}
              </strong>

            </div>

          </td>


          <td>
            ${esc(player.role)}
          </td>


          <td>
            ${esc(player.village)}
          </td>


          <td>

            <span
              class="status ${statusClass}"
            >
              ${esc(player.status)}
            </span>

          </td>


          <td>
            ${result}
          </td>

        </tr>

      `;

    }).join("");

}



/* =========================================================
   HTML ESCAPE
========================================================= */

function esc(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );

}
