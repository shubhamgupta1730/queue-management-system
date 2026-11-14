# QueueFlow — Queue Management System

A full-stack queue management application built for the Rugas Team assignment.

## Features
- Manager login with JWT authentication
- Create multiple queues
- Add people and automatically generate tokens
- View waiting queue
- Move tokens up/down
- Serve the next token
- Complete/cancel tokens
- Queue dashboard
- Wait-time and queue-length analytics
- Responsive UI

## Stack
- Frontend: React + Vite + Recharts + Lucide React
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Authentication: JWT + bcrypt

## Run locally

### 1. Backend
```bash
cd server
npm install
npm start
```
Runs on http://localhost:5000

### 2. Frontend
```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

### Demo login
- Email: `manager@queue.com`
- Password: `admin123`

## API highlights
- `POST /api/auth/login`
- `GET/POST /api/queues`
- `GET /api/queues/:id`
- `POST /api/queues/:id/tokens`
- `PUT /api/tokens/:id/move`
- `PUT /api/queues/:id/serve-next`
- `PUT /api/tokens/:id/complete`
- `PUT /api/tokens/:id/cancel`
- `GET /api/analytics/:id`

## Interview talking points
The queue position is stored separately from the token number. Moving a token swaps its position with its neighboring waiting token, so the token identity remains stable. Timestamps are stored for token creation, service start, completion and cancellation, allowing average wait time and queue trends to be calculated from real data.
