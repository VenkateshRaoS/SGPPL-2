/* =========================================================
   SGPPL-2 LIVE AUCTION
   PUBLIC AUCTION JAVASCRIPT
   ========================================================= */


const socket = io();


/* =========================================================
   INITIAL STATE
   ========================================================= */

socket.on("auction:state", function (state) {

  render(state);

});


/* =========================================================
   LOAD STATE
   ========================================================= */

fetch("/api/public/state", {
  cache: "no-store"
})

  .then(function (response) {

    if (!response.ok) {

      throw new Error(
        "Failed to load auction state"
      );

    }

    return response.json();

  })

  .then(function (state) {

    render(state);

  })

  .catch(function (error) {

    console.error(
      "Auction state error:",
      error
    );

  });



/* =========================================================
   RENDER
   ========================================================= */

function render(state) {


  state = state || {};


  const auction =
    state.auction || {};


  /* =======================================================
     CURRENT BID
  ====================================================== */

  const currentBid =
    document.getElementById("currentBid");


  if (currentBid) {

    currentBid.textContent =
      auction.currentBid || 0;

  }



  /* =======================================================
     HIGHEST TEAM
  ====================================================== */

  const highestTeam =
    document.getElementById("highestTeam");


  if (highestTeam) {

    highestTeam.textContent =
      auction.highestTeam || "—";

  }



  /* =======================================================
     TEAMS
  ====================================================== */

  const teamsContainer =
    document.getElementById("teams");


  if (teamsContainer) {

    const teams =
      state.teams || [];


    if (teams.length === 0) {

      teamsContainer.innerHTML = `
        <div class="no-history">
          No teams available
        </div>
      `;

    } else {

      teamsContainer.innerHTML =
        teams
          .map(function (team) {

            return `
              <div class="team-row">

                <div>
                  <b>${esc(team.code)}</b>
                  ${esc(team.name)}
                </div>

                <strong>
                  ₹${Number(
                    team.remainingPoints || 0
                  ).toLocaleString("en-IN")}
                </strong>

                <small>
                  ${team.playerCount || 0}/${team.maxPlayers || 25}
                  players
                </small>

              </div>
            `;

          })
          .join("");

    }

  }



  /* =======================================================
     CURRENT PLAYER
  ====================================================== */

  const player =
    state.currentPlayer;


  const playerCard =
    document.getElementById("playerCard");


  if (!playerCard) {

    return;

  }



  /* =======================================================
     NO CURRENT PLAYER
  ====================================================== */

  if (!player) {


    playerCard.className =
      "player-card empty";


    playerCard.innerHTML = `

      <div class="empty-content">

        <div class="auction-icon">
          🏏
        </div>

        <h1>
          AUCTION WILL START SOON
        </h1>

        <p>
          Waiting for the administrator to start the auction
        </p>

      </div>

    `;


  }


  /* =======================================================
     CURRENT PLAYER
  ====================================================== */

  else {


    playerCard.className =
      "player-card";


    const photo =
      player.photoUrl ||
      "/images/default-player.jpeg";


    const current =
      auction.currentBid || 0;


    const base =
      auction.baseBid || 50;


    playerCard.innerHTML = `

      <div class="photo-wrap">

        <img
          src="${esc(photo)}"
          alt="${esc(player.name)}"
          onerror="this.style.display='none'"
        >

      </div>


      <div class="player-info">


        <div class="auction-tag">

          ${
            auction.status === "LIVE"
              ? "🔴 BIDDING LIVE"
              : esc(auction.status || "AUCTION")
          }

        </div>


        <h1>
          ${esc(player.name)}
        </h1>


        <div class="role">

          ${esc(player.role || "Player")}

        </div>


        <div class="details">

          📍 ${esc(player.village || "—")}

        </div>


        <div class="price-grid">


          <div>

            <small>
              BASE PRICE
            </small>

            <b>
              ₹${Number(base).toLocaleString("en-IN")}
            </b>

          </div>


          <div>

            <small>
              CURRENT BID
            </small>

            <b>
              ₹${Number(
                current || base
              ).toLocaleString("en-IN")}
            </b>

          </div>


          <div>

            <small>
              HIGHEST BIDDER
            </small>

            <b>
              ${esc(
                auction.highestTeam || "—"
              )}
            </b>

          </div>


        </div>


      </div>

    `;

  }



  /* =======================================================
     BID HISTORY
  ====================================================== */

  const historyContainer =
    document.getElementById("history");


  if (historyContainer) {


    const history =
      auction.bidHistory || [];


    if (history.length === 0) {

      historyContainer.innerHTML = `

        <div class="no-history">
          No bids yet
        </div>

      `;

    } else {


      historyContainer.innerHTML =

        history
          .slice()
          .reverse()
          .map(function (bid) {


            let time = "";


            try {

              time =
                new Date(
                  bid.at
                ).toLocaleTimeString();

            } catch (e) {

              time = "";

            }


            return `

              <div class="history-row">

                <b>
                  ₹${Number(
                    bid.amount || 0
                  ).toLocaleString("en-IN")}
                </b>

                <span>
                  ${esc(bid.team || "—")}
                </span>

                <small>
                  ${esc(time)}
                </small>

              </div>

            `;

          })
          .join("");

    }

  }



  /* =======================================================
     PLAYER TABLE
  ====================================================== */

  const playersContainer =
    document.getElementById("players");


  if (playersContainer) {


    const players =
      state.players || [];


    if (players.length === 0) {

      playersContainer.innerHTML = `

        <tr>

          <td
            colspan="6"
            style="
              text-align:center;
              padding:30px;
              color:#64748b;
            "
          >
            No players registered yet
          </td>

        </tr>

      `;

    } else {


      playersContainer.innerHTML =

        players
          .map(function (player) {


            const status =
              String(
                player.status || "PENDING"
              ).toLowerCase();


            const result =
              player.status === "SOLD"

                ? `${esc(
                    player.soldTeam || ""
                  )} • ₹${Number(
                    player.soldPoints || 0
                  ).toLocaleString("en-IN")}`

                : "—";


            return `

              <tr>


                <td>

                  <img

                    class="thumb"

                    src="${esc(
                      player.photoUrl ||
                      "/images/default-player.jpeg"
                    )}"

                    alt="${esc(
                      player.name
                    )}"

                    onerror="
                      this.style.display='none'
                    "

                  >

                </td>


                <td>

                  <strong>
                    ${esc(player.name)}
                  </strong>

                </td>


                <td>
                  ${esc(player.role || "—")}
                </td>


                <td>
                  ${esc(player.village || "—")}
                </td>


                <td>

                  <span
                    class="status ${status}"
                  >
                    ${esc(
                      player.status || "PENDING"
                    )}
                  </span>

                </td>


                <td>
                  ${result}
                </td>


              </tr>

            `;

          })
          .join("");

    }

  }

}



/* =========================================================
   HTML ESCAPE
   ========================================================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    function (character) {

      return {

        "&": "&amp;",

        "<": "&lt;",

        ">": "&gt;",

        '"': "&quot;",

        "'": "&#039;"

      }[character];

    }
  );

}
