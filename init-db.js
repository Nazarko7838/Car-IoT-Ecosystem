const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'cariot.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Таблиця користувачів
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 2. Таблиця автомобілів
  db.run(`CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    vin TEXT UNIQUE,
    license_plate TEXT,
    mileage INTEGER DEFAULT 0,
    transmission TEXT,
    fuel_type TEXT,
    color TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // 3. Таблиця телеметрії
  db.run(`CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    speed REAL,
    rpm INTEGER,
    coolant_temp INTEGER,
    oil_pressure INTEGER,
    fuel_level INTEGER,
    battery_voltage REAL,
    load REAL,
    intake_temp INTEGER,
    air_flow REAL,
    throttle REAL,
    runtime INTEGER,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE
  )`);

  // 4. Таблиця команд керування
  db.run(`CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    command_type TEXT NOT NULL,
    state TEXT,
    status TEXT DEFAULT 'pending',
    response TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // 5. Таблиця сервісної книжки (ТО)
  db.run(`CREATE TABLE IF NOT EXISTS maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    work_type TEXT NOT NULL,
    description TEXT,
    mileage_at_service INTEGER,
    service_date DATE NOT NULL,
    next_service_mileage INTEGER,
    next_service_date DATE,
    cost REAL,
    provider TEXT,
    parts_used TEXT,
    notes TEXT,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  // 6. Таблиця маршрутів (Поїздки)
  db.run(`CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    user_id INTEGER,
    start_location TEXT,
    end_location TEXT,
    start_time DATETIME,
    end_time DATETIME,
    distance_km REAL,
    duration_minutes INTEGER,
    avg_speed REAL,
    max_speed REAL,
    fuel_consumed REAL,
    efficiency_rating INTEGER,
    harsh_brakes INTEGER,
    harsh_accelerations INTEGER,
    speed_violations INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  console.log('✓ База даних ініціалізована успішно!');
});

db.close();