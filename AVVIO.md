# Come avviare il progetto in sviluppo locale

## Prerequisiti
- Node.js installato
- PostgreSQL installato e avviato

## 1. Configurare il database
```sql
-- Dal terminale PostgreSQL:
CREATE DATABASE gestionale_hotel;
```
Poi eseguire le migration:
```
psql -U postgres -d gestionale_hotel -f database/migrations/001_users.sql
psql -U postgres -d gestionale_hotel -f database/migrations/002_hr.sql
psql -U postgres -d gestionale_hotel -f database/seed.sql
```

## 2. Configurare il backend
```
cd backend
cp .env.example .env
# Aprire .env e inserire la password del tuo PostgreSQL e una JWT_SECRET casuale
npm run dev
```
Il backend parte su http://localhost:7001

## 3. Avviare il frontend
```
cd frontend
npm run dev
```
Il frontend parte su http://localhost:7000

## Primo accesso
- Email: admin@hotel.it
- Password: Admin1234
- **Cambiare subito la password dalla sezione Utenti!**
