# SGPPL-2 — Live IPL-style Cricket Auction

This starter is designed around your exact workflow:

1. Player registers on the website.
2. Player enters UTR and uploads player photo/payment screenshot.
3. Admin receives the payment in the UPI/bank app.
4. Admin copies the received UTR and pastes it into **VERIFY UTR**.
5. Exact UTR match automatically changes the player to **CONFIRMED / AUCTION ELIGIBLE**.
6. Admin selects the player and starts the auction.
7. Admin clicks the team that is bidding:
   - RCJ → 200
   - JCB → 210
   - RCJ → 220
   - JCB → 230
8. The public auction page receives the changes live through Socket.IO.
9. Admin clicks SOLD. The winning team's points and player count are updated.
10. Each team is limited to 25 players.

## Run locally

Install Node.js 20+.

Start MongoDB and Redis:

```bash
docker compose up -d
```

Copy `.env.example` to `.env` and change the admin password and JWT secret.

Install dependencies:

```bash
npm install
```

Start:

```bash
npm start
```

Open:

- Public auction: http://localhost:3000/
- Admin: http://localhost:3000/admin.html

## Important for 1,000+ viewers

The auction state is tiny and is pushed only when something changes. The player photo is not sent through Socket.IO; viewers receive an image URL and the browser caches it.

For the real public tournament deployment, put the app behind a CDN/reverse proxy and store player/payment images in object storage/CDN (S3/Cloudflare R2/Cloudinary/etc.) rather than the Node server disk.

For multiple Node instances, use the Socket.IO Redis adapter so all instances share auction events. Also use a load balancer with WebSocket support and sticky sessions if required by the deployment.

A 1,000-viewer target should be load-tested before the real auction. No software can honestly guarantee zero lag without testing the exact hosting/network setup.

## Security before going live

- Change `ADMIN_PASSWORD`.
- Change `JWT_SECRET`.
- Use HTTPS.
- Add rate limiting/WAF.
- Keep MongoDB and Redis private.
- Do not expose uploaded payment screenshots publicly; move them to private object storage with signed URLs.
- Back up MongoDB.
- Add an audit log for bids and admin actions.
- Add an atomic/Redis lock around bidding if running multiple server instances.
