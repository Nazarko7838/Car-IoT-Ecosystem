const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// SQLite Database
const dbPath = path.join(__dirname, 'cariot.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Помилка підключення до БД:', err);
  else console.log('✓ SQLite підключена');
});

// Helper functions
const runAsync = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const getAsync = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allAsync = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Middleware для перевірки токена
function verifyToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Відсутній токен' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Невалідний токен' });
    req.user = user;
    next();
  });
}

// ═══════════════════ АУТЕНТИФІКАЦІЯ ═══════════════════

// Реєстрація
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, first_name, last_name, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Потрібні: username, email, password' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await runAsync(
      `INSERT INTO users (username, email, password, first_name, last_name, phone) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, first_name || '', last_name || '', phone || '']
    );

    const user = await getAsync('SELECT id, username, email, first_name, last_name FROM users WHERE id = ?', [result.id]);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    res.status(400).json({ error: error.message });
  }
});

// Вхід
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Потрібні: username, password' });
    }

    const user = await getAsync('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Невірні реквізити' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Невірні реквізити' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ ПРОФІЛЬ КОРИСТУВАЧА ═══════════════════

// Отримати профіль
app.get('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const user = await getAsync('SELECT id, username, email, first_name, last_name, phone, created_at FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Оновити профіль
app.put('/api/user/profile', verifyToken, async (req, res) => {
  try {
    const { first_name, last_name, phone, email } = req.body;
    
    await runAsync(
      `UPDATE users SET first_name = ?, last_name = ?, phone = ?, email = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [first_name, last_name, phone, email, req.user.id]
    );

    const user = await getAsync('SELECT id, username, email, first_name, last_name, phone FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ АВТОМОБІЛІ ═══════════════════

// Отримати всі автомобілі користувача
app.get('/api/cars', verifyToken, async (req, res) => {
  try {
    const cars = await allAsync('SELECT * FROM cars WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(cars);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Отримати один автомобіль
app.get('/api/cars/:id', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });
    res.json(car);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Додати новий автомобіль
// Додати новий автомобіль
app.post('/api/cars', verifyToken, async (req, res) => {
  try {
    // ЗАМІНА 1: Замінили engine_type на mileage
    const { name, brand, model, year, vin, license_plate, mileage, transmission, fuel_type, color, notes } = req.body;

    const result = await runAsync(
      // ЗАМІНА 2: Замінили engine_type на mileage в SQL-запиті
      `INSERT INTO cars (user_id, name, brand, model, year, vin, license_plate, mileage, transmission, fuel_type, color, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, brand, model, year, vin, license_plate, mileage, transmission, fuel_type, color, notes]
    );

    const car = await getAsync('SELECT * FROM cars WHERE id = ?', [result.id]);
    res.json({ success: true, car });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ ТЕЛЕМЕТРІЯ ═══════════════════

// Отримати останню телеметрію
app.get('/api/cars/:id/metrics/latest', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const telemetry = await getAsync(
      'SELECT * FROM telemetry WHERE car_id = ? ORDER BY recorded_at DESC LIMIT 1',
      [req.params.id]
    );

    res.json(telemetry || {});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Отримати історію телеметрії
app.get('/api/cars/:id/metrics/history', verifyToken, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const telemetry = await allAsync(
      'SELECT * FROM telemetry WHERE car_id = ? ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
      [req.params.id, limit, offset]
    );

    res.json(telemetry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Додати телеметрію
app.post('/api/cars/:id/metrics', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const {
      speed, rpm, coolant_temp, oil_pressure, fuel_level, battery_voltage,
      load, intake_temp, air_flow, throttle, runtime, latitude, longitude, altitude
    } = req.body;

    const result = await runAsync(
      `INSERT INTO telemetry (
        car_id, speed, rpm, coolant_temp, oil_pressure, fuel_level, battery_voltage,
        load, intake_temp, air_flow, throttle, runtime, latitude, longitude, altitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, speed, rpm, coolant_temp, oil_pressure, fuel_level, battery_voltage,
        load, intake_temp, air_flow, throttle, runtime, latitude, longitude, altitude
      ]
    );

    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ СЕРВІСНА КНИЖКА ═══════════════════

// Отримати все сервісні записи
app.get('/api/cars/:id/maintenance', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const records = await allAsync(
      'SELECT * FROM maintenance_records WHERE car_id = ? ORDER BY service_date DESC',
      [req.params.id]
    );

    res.json(records);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Додати запис сервісної книжки
app.post('/api/cars/:id/maintenance', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const {
      work_type, description, mileage_at_service, service_date, next_service_mileage,
      next_service_date, cost, provider, parts_used, notes, status
    } = req.body;

    if (!work_type || !service_date) {
      return res.status(400).json({ error: 'Потрібні: work_type, service_date' });
    }

    const result = await runAsync(
      `INSERT INTO maintenance_records (
        car_id, user_id, work_type, description, mileage_at_service, service_date,
        next_service_mileage, next_service_date, cost, provider, parts_used, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.user.id, work_type, description, mileage_at_service, service_date,
        next_service_mileage, next_service_date, cost, provider, parts_used, notes, status || 'completed'
      ]
    );

    // Оновити пробіг автомобіля якщо вказано
    if (mileage_at_service) {
      await runAsync('UPDATE cars SET mileage = ? WHERE id = ?', [mileage_at_service, req.params.id]);
    }

    const record = await getAsync('SELECT * FROM maintenance_records WHERE id = ?', [result.id]);
    res.json({ success: true, record });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Оновити запис сервісної книжки
app.put('/api/cars/:id/maintenance/:recordId', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const record = await getAsync('SELECT * FROM maintenance_records WHERE id = ? AND car_id = ?', [req.params.recordId, req.params.id]);
    if (!record) return res.status(404).json({ error: 'Запис не знайдений' });

    const {
      work_type, description, mileage_at_service, service_date, next_service_mileage,
      next_service_date, cost, provider, parts_used, notes, status
    } = req.body;

    await runAsync(
      `UPDATE maintenance_records SET work_type = ?, description = ?, mileage_at_service = ?,
       service_date = ?, next_service_mileage = ?, next_service_date = ?, cost = ?, provider = ?,
       parts_used = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        work_type || record.work_type,
        description || record.description,
        mileage_at_service || record.mileage_at_service,
        service_date || record.service_date,
        next_service_mileage || record.next_service_mileage,
        next_service_date || record.next_service_date,
        cost !== undefined ? cost : record.cost,
        provider || record.provider,
        parts_used || record.parts_used,
        notes || record.notes,
        status || record.status,
        req.params.recordId
      ]
    );

    const updated = await getAsync('SELECT * FROM maintenance_records WHERE id = ?', [req.params.recordId]);
    res.json({ success: true, record: updated });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ КОМАНДИ КЕРУВАННЯ ═══════════════════

// Отримати команди
app.get('/api/cars/:id/commands', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const commands = await allAsync(
      'SELECT * FROM commands WHERE car_id = ? ORDER BY sent_at DESC LIMIT 20',
      [req.params.id]
    );

    res.json(commands);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Послати команду
app.post('/api/cars/:id/commands', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const { command_type, state } = req.body;

    if (!command_type) {
      return res.status(400).json({ error: 'Потрібен command_type' });
    }

    const result = await runAsync(
      `INSERT INTO commands (car_id, user_id, command_type, state, status) 
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.params.id, req.user.id, command_type, state || '']
    );

    const command = await getAsync('SELECT * FROM commands WHERE id = ?', [result.id]);
    res.json({ success: true, command });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ ШИНИ ═══════════════════

// Отримати дані про шини
app.get('/api/cars/:id/tires', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const tires = await getAsync(
      'SELECT * FROM tires WHERE car_id = ? ORDER BY last_check DESC LIMIT 1',
      [req.params.id]
    );

    res.json(tires || {});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ МАРШРУТИ ═══════════════════

// Отримати маршрути
app.get('/api/cars/:id/trips', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const trips = await allAsync(
      'SELECT * FROM trips WHERE car_id = ? ORDER BY start_time DESC LIMIT 50',
      [req.params.id]
    );

    res.json(trips);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Додати маршрут
app.post('/api/cars/:id/trips', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const {
      start_location, end_location, start_time, end_time, distance_km, duration_minutes,
      avg_speed, max_speed, fuel_consumed, efficiency_rating, harsh_brakes, harsh_accelerations,
      speed_violations, notes
    } = req.body;

    const result = await runAsync(
      `INSERT INTO trips (
        car_id, user_id, start_location, end_location, start_time, end_time, distance_km,
        duration_minutes, avg_speed, max_speed, fuel_consumed, efficiency_rating,
        harsh_brakes, harsh_accelerations, speed_violations, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, req.user.id, start_location, end_location, start_time, end_time,
        distance_km, duration_minutes, avg_speed, max_speed, fuel_consumed, efficiency_rating,
        harsh_brakes, harsh_accelerations, speed_violations, notes
      ]
    );

    const trip = await getAsync('SELECT * FROM trips WHERE id = ?', [result.id]);
    res.json({ success: true, trip });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ АЛЕРТИ ═══════════════════

// Отримати алерти
app.get('/api/cars/:id/alerts', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const alerts = await allAsync(
      'SELECT * FROM alerts WHERE car_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json(alerts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Додати алерт
app.post('/api/cars/:id/alerts', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const { alert_type, severity, title, description } = req.body;

    const result = await runAsync(
      `INSERT INTO alerts (car_id, alert_type, severity, title, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, alert_type, severity, title, description]
    );

    const alert = await getAsync('SELECT * FROM alerts WHERE id = ?', [result.id]);
    res.json({ success: true, alert });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ ВИДАЛЕННЯ ═══════════════════

// Видалити автомобіль
app.delete('/api/cars/:id', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    await runAsync('DELETE FROM cars WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Видалити запис сервісу
app.delete('/api/cars/:id/maintenance/:recordId', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    await runAsync('DELETE FROM maintenance_records WHERE id = ? AND car_id = ?', [req.params.recordId, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Видалити маршрут
app.delete('/api/cars/:id/trips/:tripId', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    await runAsync('DELETE FROM trips WHERE id = ? AND car_id = ?', [req.params.tripId, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Видалити алерт
app.delete('/api/cars/:id/alerts/:alertId', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    await runAsync('DELETE FROM alerts WHERE id = ? AND car_id = ?', [req.params.alertId, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ СТАТИСТИКА ═══════════════════

// Отримати статистику користувача
app.get('/api/stats', verifyToken, async (req, res) => {
  try {
    const cars = await allAsync('SELECT COUNT(*) as count FROM cars WHERE user_id = ?', [req.user.id]);
    const maintenance = await allAsync('SELECT COUNT(*) as count FROM maintenance_records WHERE user_id = ?', [req.user.id]);
    const trips = await allAsync('SELECT COUNT(*) as count FROM trips WHERE user_id = ?', [req.user.id]);
    const totalCost = await getAsync('SELECT SUM(cost) as total FROM maintenance_records WHERE user_id = ?', [req.user.id]);
    const totalDistance = await getAsync('SELECT SUM(distance_km) as total FROM trips WHERE user_id = ?', [req.user.id]);

    res.json({
      cars: cars[0]?.count || 0,
      maintenance_records: maintenance[0]?.count || 0,
      trips: trips[0]?.count || 0,
      total_spending: totalCost?.total || 0,
      total_distance: totalDistance?.total || 0
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Отримати статистику автомобіля
app.get('/api/cars/:id/stats', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const maintenance = await allAsync('SELECT COUNT(*) as count, SUM(cost) as total FROM maintenance_records WHERE car_id = ?', [req.params.id]);
    const trips = await allAsync('SELECT COUNT(*) as count, SUM(distance_km) as total FROM trips WHERE car_id = ?', [req.params.id]);

    res.json({
      mileage: car.mileage || 0,
      maintenance_count: maintenance[0]?.count || 0,
      maintenance_spending: maintenance[0]?.total || 0,
      trips_count: trips[0]?.count || 0,
      total_distance: trips[0]?.total || 0
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ═══════════════════ ПОШУК ═══════════════════

// Пошук по обслуговуванню
app.get('/api/cars/:id/maintenance/search', verifyToken, async (req, res) => {
  try {
    const car = await getAsync('SELECT * FROM cars WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!car) return res.status(404).json({ error: 'Автомобіль не знайдений' });

    const { query } = req.query;
    const records = await allAsync(
      `SELECT * FROM maintenance_records WHERE car_id = ? AND (work_type LIKE ? OR description LIKE ?) ORDER BY service_date DESC`,
      [req.params.id, `%${query}%`, `%${query}%`]
    );

    res.json(records);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Запустити сервер
app.listen(PORT, () => {
  console.log(`✓ Сервер запущено на http://localhost:${PORT}`);
});
