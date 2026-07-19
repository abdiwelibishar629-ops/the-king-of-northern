const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================================
// MYSQL CONNECTION - XAMPP phpMyAdmin
// ============================================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'king_of_northern'
});

db.connect((err) => {
    if (err) {
        console.error('❌ MySQL Connection Error:', err);
        return;
    }
    console.log('✅ MySQL Connected Successfully');
});

// ============================================================
// JWT SECRET
// ============================================================
const JWT_SECRET = 'king-of-northern-super-secret-key-2024';

// ============================================================
// PWA SUPPORT
// ============================================================
app.get('/sw.js', (req, res) => {
    res.sendFile(__dirname + '/sw.js');
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(__dirname + '/manifest.json');
});

app.get('/driver-manifest.json', (req, res) => {
    res.sendFile(__dirname + '/driver-manifest.json');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// ============================================================
// LOGIN API - FIXED
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { email, phone, password } = req.body;

    console.log('🔐 Login attempt:', { email, phone });

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    const sql = `SELECT * FROM users WHERE email = ? OR phone = ?`;
    
    db.query(sql, [email, phone], async (err, results) => {
        if (err) {
            console.error('❌ Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        console.log('📊 Query results:', results.length);

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials - user not found' });
        }

        const user = results[0];
        console.log('👤 User found:', user.email);

        if (!user.is_verified) {
            return res.status(401).json({ error: 'Please verify your account first' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        console.log('🔑 Password match:', isMatch);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials - wrong password' });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: user.is_verified,
                driverLicense: user.driver_license,
                carModel: user.car_model,
                carPlate: user.car_plate
            }
        });
    });
});

// ============================================================
// REGISTER APIs
// ============================================================
app.post('/api/auth/register/customer', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users (full_name, email, phone, password, role, is_verified)
                     VALUES (?, ?, ?, ?, 'customer', TRUE)`;

        db.query(sql, [fullName, email, phone, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email or phone already registered' });
                }
                console.error('Registration error:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            res.json({
                success: true,
                message: 'Registration successful!',
                userId: result.insertId
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/register/driver', async (req, res) => {
    const { fullName, email, phone, password, driverLicense, carModel, carPlate } = req.body;

    if (!fullName || !email || !phone || !password || !driverLicense || !carModel || !carPlate) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users (full_name, email, phone, password, role, driver_license, car_model, car_plate, is_verified, status)
                     VALUES (?, ?, ?, ?, 'driver', ?, ?, ?, TRUE, 'available')`;

        db.query(sql, [fullName, email, phone, hashedPassword, driverLicense, carModel, carPlate], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email, phone, or license already registered' });
                }
                console.error('Driver registration error:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            res.json({
                success: true,
                message: 'Driver registration successful!',
                userId: result.insertId
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================
// RIDE APIs
// ============================================================
app.post('/api/request-ride', (req, res) => {
    const { customerId, customerName, phone, pickup, destination, vehicleType } = req.body;

    if (!customerId || !pickup || !destination) {
        return res.status(400).json({ error: 'All fields required' });
    }

    const checkSql = `SELECT * FROM rides WHERE customer_id = ? AND status IN ('pending', 'confirmed', 'in_progress')`;
    
    db.query(checkSql, [customerId], (err, pending) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (pending.length > 0) {
            return res.status(400).json({ error: 'You have a pending ride. Please complete it first.' });
        }

        const driverSql = `SELECT * FROM users WHERE role = 'driver' AND status = 'available' AND is_verified = TRUE LIMIT 1`;
        
        db.query(driverSql, (err2, drivers) => {
            if (err2 || drivers.length === 0) {
                return res.status(404).json({ error: 'No drivers available. Please try again later.' });
            }

            const driver = drivers[0];
            const estimatedTime = Math.floor(Math.random() * 10) + 5;

            const rideSql = `INSERT INTO rides (customer_id, customer_name, customer_phone, pickup, destination, vehicle_type, 
                           status, driver_name, driver_phone, driver_plate, driver_car, estimated_time)
                           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`;

            db.query(rideSql, [
                customerId, 
                customerName || 'Customer', 
                phone || '',
                pickup, 
                destination, 
                vehicleType || 'Any',
                driver.full_name, 
                driver.phone, 
                driver.car_plate, 
                driver.car_model, 
                estimatedTime
            ], (err3, result) => {
                if (err3) {
                    console.error('Ride creation error:', err3);
                    return res.status(500).json({ error: 'Failed to create ride' });
                }

                db.query(`UPDATE users SET status = 'busy' WHERE id = ?`, [driver.id]);

                res.json({
                    success: true,
                    message: `✅ Ride requested! ${driver.full_name} is on the way.`,
                    rideId: result.insertId,
                    driver: {
                        name: driver.full_name,
                        phone: driver.phone,
                        plate: driver.car_plate,
                        car: driver.car_model,
                        rating: driver.rating
                    },
                    estimatedTime
                });
            });
        });
    });
});

app.get('/api/ride-status/:id', (req, res) => {
    const sql = `SELECT * FROM rides WHERE id = ?`;
    db.query(sql, [req.params.id], (err, rides) => {
        if (err || rides.length === 0) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        res.json(rides[0]);
    });
});

app.get('/api/driver/requests', (req, res) => {
    const sql = `SELECT * FROM rides WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`;
    db.query(sql, (err, rides) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rides);
    });
});

app.post('/api/driver/confirm-ride', (req, res) => {
    const { rideId, driverId } = req.body;

    const checkSql = `SELECT * FROM rides WHERE id = ? AND status = 'pending'`;
    
    db.query(checkSql, [rideId], (err, rides) => {
        if (err || rides.length === 0) {
            return res.status(400).json({ error: 'Ride already confirmed or completed' });
        }

        const updateSql = `UPDATE rides SET status = 'confirmed', driver_id = ? WHERE id = ?`;
        
        db.query(updateSql, [driverId, rideId], (err2) => {
            if (err2) {
                return res.status(500).json({ error: 'Failed to confirm ride' });
            }

            db.query(`UPDATE users SET status = 'busy' WHERE id = ?`, [driverId]);

            db.query(`SELECT * FROM rides WHERE id = ?`, [rideId], (err3, rideResult) => {
                const ride = rideResult[0];
                res.json({
                    success: true,
                    message: '✅ Ride confirmed!',
                    driver: {
                        name: ride.driver_name,
                        phone: ride.driver_phone,
                        plate: ride.driver_plate,
                        car: ride.driver_car
                    }
                });
            });
        });
    });
});

app.post('/api/driver/complete-ride', (req, res) => {
    const { rideId, driverId } = req.body;

    const updateSql = `UPDATE rides SET status = 'completed' WHERE id = ? AND driver_id = ? AND status = 'confirmed'`;
    
    db.query(updateSql, [rideId, driverId], (err, result) => {
        if (err || result.affectedRows === 0) {
            return res.status(400).json({ error: 'Ride not found or already completed' });
        }

        db.query(`UPDATE users SET status = 'available' WHERE id = ?`, [driverId]);

        res.json({
            success: true,
            message: '✅ Ride completed!'
        });
    });
});

app.get('/api/drivers', (req, res) => {
    const sql = `SELECT id, full_name, phone, car_model, car_plate, status, rating FROM users WHERE role = 'driver'`;
    db.query(sql, (err, drivers) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(drivers);
    });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`📊 Database: MySQL (phpMyAdmin)`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`🔐 Auth System: Active (JWT + Email Verification)`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
    console.log(`👨‍✈️ Test Driver: driver@test.com / driver123`);
});
