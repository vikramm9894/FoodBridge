# 🌿 FoodBridge – Surplus Food Rescue Platform

A web app that connects restaurants/homes having surplus food with NGOs, while volunteers deliver it before it expires.
Tracks **meals rescued** and **CO₂ avoided**.

## Features
- Role-based login: Donor, Receiver (NGO), Volunteer, Admin
- Post / edit / delete food donations with expiry time
- Search & filter food, request it, approve / reject requests
- Volunteers claim and complete deliveries
- Impact dashboard, Top Donors leaderboard, admin notices

## Tech Stack
HTML, CSS, JavaScript (front-end) · Node.js built-in `http` module (back-end, no dependencies) · JSON file storage

## Run locally
Requires Node.js 16+.
```bash
node server.js     # or: npm start
```
Open http://localhost:3000

## Demo logins
| Role | Email | Password |
|---|---|---|
| Admin | admin@foodbridge.com | admin123 |
| Donor | donor@foodbridge.com | demo123 |
| NGO | ngo@foodbridge.com | demo123 |
| Volunteer | volunteer@foodbridge.com | demo123 |

## Agile / Jira
5 Epics · 15 User Stories · 46 Story Points (managed in Jira).
