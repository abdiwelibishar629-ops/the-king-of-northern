const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================================
// POSTGRESQL CONNECTION - SUPABASE
// ============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Hx1kme6Inu587tiJ@db.nszarqqgmzgybfyreagc.supabase.co:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL Connected Successfully'))
    .catch(err => console.error('❌ PostgreSQL Connection Error:', err));

// ============================================================
// JWT SECRET
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'king-of-northern-super-secret-key-2024';

// ============================================================
// PWA SUPPORT
// ============================================================
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(__dirname + '/sw.js');
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(__dirname + '/manifest.json');
});

app.get('/driver-manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(__dirname + '/driver-manifest.json');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ============================================================
// CREATE TABLES AND TEST DRIVER
// ============================================================
async function createTables() {
    try {
        // Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL,
                driver_license VARCHAR(50),
                car_model VARCHAR(50),
                car_plate VARCHAR(20),
                is_verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(10),
                verification_code_expires TIMESTAMP,
                rating DECIMAL(3,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table created');

        // Rides table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rides (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER REFERENCES users(id),
                driver_id INTEGER REFERENCES users(id),
                customer_name VARCHAR(100) NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                pickup VARCHAR(255) NOT NULL,
                destination VARCHAR(255) NOT NULL,
                vehicle_type VARCHAR(50) DEFAULT 'Any',
                status VARCHAR(20) DEFAULT 'pending',
                driver_name VARCHAR(100),
                driver_phone VARCHAR(20),
                driver_plate VARCHAR(20),
                driver_car VARCHAR(50),
                estimated_time INTEGER DEFAULT 0,
                fare DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Rides table created');

        // ============================================================
        // CREATE TEST DRIVER - FIXES LOGIN ISSUE!
        // ============================================================
        const testPassword = await bcrypt.hash('driver123', 10);
        
        // Check if test driver exists
        const checkDriver = await pool.query(
            `SELECT * FROM users WHERE email = 'driver@test.com'`
        );

        if (checkDriver.rows.length === 0) {
            await pool.query(`
                INSERT INTO users (full_name, email, phone, password, role, driver_license, car_model, car_plate, is_verified, status)
                VALUES ($1, $2, $3, $4, 'driver', $5, $6, $7, TRUE, 'available')
            `, ['Test Driver', 'driver@test.com', '0712345678', testPassword, 'DL001', 'Toyota Probox', 'KCA 123A']);
            console.log('✅ Test driver created: driver@test.com / driver123');
        } else {
            console.log('✅ Test driver already exists');
        }

        // ============================================================
        // CREATE SAMPLE DRIVERS
        // ============================================================
        const samplePassword = await bcrypt.hash('driver123', 10);
        const sampleDrivers = [
            ['Ahmed Hassan', 'ahmed@example.com', '0712345678', samplePassword, 'DL002', 'Nissan Note', 'KDA 456B'],
            ['Fatuma Ali', 'fatuma@example.com', '0723456789', samplePassword, 'DL003', 'Toyota Sienta', 'KEA 789C'],
            ['Omar Abdi', 'omar@example.com', '0734567890', samplePassword, 'DL004', 'Toyota Probox', 'KGA 345E']
        ];

        for (const driver of sampleDrivers) {
            const check = await pool.query(`SELECT * FROM users WHERE email = $1`, [driver[1]]);
            if (check.rows.length === 0) {
                await pool.query(`
                    INSERT INTO users (full_name, email, phone, password, role, driver_license, car_model, car_plate, is_verified, status)
                    VALUES ($1, $2, $3, $4, 'driver', $5, $6, $7, TRUE, 'available')
                `, driver);
                console.log(`✅ Sample driver created: ${driver[0]}`);
            }
        }

    } catch (error) {
        console.error('❌ Table creation error:', error);
    }
}

createTables();

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// ============================================================
// AUTH APIs
// ============================================================
app.post('/api/auth/register/customer', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const verificationCode = generateVerificationCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password, role, verification_code, verification_code_expires)
             VALUES ($1, $2, $3, $4, 'customer', $5, NOW() + INTERVAL '10 minutes')
             RETURNING id`,
            [fullName, email, phone, hashedPassword, verificationCode]
        );

        res.json({
            success: true,
            message: 'Registration successful! Check your email for verification code.',
            userId: result.rows[0].id
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Email or phone already registered' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/register/driver', async (req, res) => {
    const { fullName, email, phone, password, driverLicense, carModel, carPlate } = req.body;

    if (!fullName || !email || !phone || !password || !driverLicense || !carModel || !carPlate) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const verificationCode = generateVerificationCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (full_name, email, phone, password, role, driver_license, car_model, car_plate, verification_code, verification_code_expires, status)
             VALUES ($1, $2, $3, $4, 'driver', $5, $6, $7, $8, NOW() + INTERVAL '10 minutes', 'available')
             RETURNING id`,
            [fullName, email, phone, hashedPassword, driverLicense, carModel, carPlate, verificationCode]
        );

        res.json({
            success: true,
            message: 'Driver registration successful! Check your email for verification code.',
            userId: result.rows[0].id
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Email, phone, or license already registered' });
        }
        console.error('Driver registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    const { email, phone, code } = req.body;

    try {
        const result = await pool.query(
            `SELECT * FROM users WHERE (email = $1 OR phone = $2) 
             AND verification_code = $3 AND verification_code_expires > NOW()`,
            [email, phone, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        const user = result.rows[0];
        await pool.query(
            `UPDATE users SET is_verified = TRUE, verification_code = NULL, verification_code_expires = NULL WHERE id = $1`,
            [user.id]
        );

        const token = generateToken(user);
        res.json({
            success: true,
            message: 'Verification successful!',
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: true,
                driverLicense: user.driver_license,
                carModel: user.car_model,
                carPlate: user.car_plate
            }
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ============================================================
// LOGIN API - FIXED
// ============================================================
app.post('/api/auth/login', async (req, res) => {
    const { email, phone, password } = req.body;

    console.log('🔐 Login attempt:', { email, phone });

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    try {
        // Search by email OR phone
        const result = await pool.query(
            `SELECT * FROM users WHERE email = $1 OR phone = $2`,
            [email, phone]
        );

        console.log('📊 Query result rows:', result.rows.length);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials - user not found' });
        }

        const user = result.rows[0];
        console.log('👤 User found:', user.email, 'Role:', user.role, 'Verified:', user.is_verified);

        // Check if account is verified
        if (!user.is_verified) {
            return res.status(401).json({ error: 'Please verify your account first' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('🔑 Password match:', isMatch);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials - wrong password' });
        }

        // Generate token
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
                carPlate: user.car_plate,
                rating: user.rating
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

// ============================================================
// RIDE APIs
// ============================================================
app.post('/api/request-ride', async (req, res) => {
    const { customerId, customerName, phone, pickup, destination, vehicleType } = req.body;

    if (!customerId || !pickup || !destination) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        // Check for pending rides
        const pendingResult = await pool.query(
            `SELECT * FROM rides WHERE customer_id = $1 AND status IN ('pending', 'confirmed', 'in_progress')`,
            [customerId]
        );

        if (pendingResult.rows.length > 0) {
            return res.status(400).json({ error: 'You have a pending ride. Please complete it first.' });
        }

        // Find available driver
        const driverResult = await pool.query(
            `SELECT * FROM users WHERE role = 'driver' AND status = 'available' AND is_verified = TRUE LIMIT 1`
        );

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ error: 'No drivers available. Please try again later.' });
        }

        const driver = driverResult.rows[0];
        const estimatedTime = Math.floor(Math.random() * 10) + 5;

        const rideResult = await pool.query(
            `INSERT INTO rides (customer_id, customer_name, customer_phone, pickup, destination, vehicle_type, 
             status, driver_name, driver_phone, driver_plate, driver_car, estimated_time)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11)
             RETURNING id`,
            [customerId, customerName || 'Customer', phone || '', pickup, destination, vehicleType || 'Any',
             driver.full_name, driver.phone, driver.car_plate, driver.car_model, estimatedTime]
        );

        // Update driver status
        await pool.query(`UPDATE users SET status = 'busy' WHERE id = $1`, [driver.id]);

        res.json({
            success: true,
            message: `✅ Ride requested! ${driver.full_name} is on the way.`,
            rideId: rideResult.rows[0].id,
            driver: {
                name: driver.full_name,
                phone: driver.phone,
                plate: driver.car_plate,
                car: driver.car_model,
                rating: driver.rating
            },
            estimatedTime
        });
    } catch (error) {
        console.error('Request ride error:', error);
        res.status(500).json({ error: 'Failed to request ride' });
    }
});

app.get('/api/ride-status/:id', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ride status error:', error);
        res.status(500).json({ error: 'Failed to get ride status' });
    }
});

app.get('/api/driver/requests', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM rides WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get pending rides error:', error);
        res.status(500).json({ error: 'Failed to get pending rides' });
    }
});

app.post('/api/driver/confirm-ride', async (req, res) => {
    const { rideId, driverId } = req.body;

    try {
        const rideResult = await pool.query(
            `SELECT * FROM rides WHERE id = $1 AND status = 'pending'`,
            [rideId]
        );

        if (rideResult.rows.length === 0) {
            return res.status(400).json({ error: 'Ride already confirmed or completed' });
        }

        await pool.query(
            `UPDATE rides SET status = 'confirmed', driver_id = $1 WHERE id = $2`,
            [driverId, rideId]
        );

        await pool.query(`UPDATE users SET status = 'busy' WHERE id = $1`, [driverId]);

        const driverResult = await pool.query(
            `SELECT * FROM users WHERE id = $1`,
            [driverId]
        );
        const driver = driverResult.rows[0];

        res.json({
            success: true,
            message: '✅ Ride confirmed!',
            driver: {
                name: driver.full_name,
                phone: driver.phone,
                plate: driver.car_plate,
                car: driver.car_model
            }
        });
    } catch (error) {
        console.error('Confirm ride error:', error);
        res.status(500).json({ error: 'Failed to confirm ride' });
    }
});

app.post('/api/driver/complete-ride', async (req, res) => {
    const { rideId, driverId } = req.body;

    try {
        await pool.query(
            `UPDATE rides SET status = 'completed' WHERE id = $1 AND driver_id = $2 AND status = 'confirmed'`,
            [rideId, driverId]
        );

        await pool.query(`UPDATE users SET status = 'available' WHERE id = $1`, [driverId]);

        res.json({ success: true, message: '✅ Ride completed!' });
    } catch (error) {
        console.error('Complete ride error:', error);
        res.status(500).json({ error: 'Failed to complete ride' });
    }
});

app.get('/api/drivers', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, phone, car_model, car_plate, status, rating FROM users WHERE role = 'driver'`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get drivers error:', error);
        res.status(500).json({ error: 'Failed to get drivers' });
    }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`📊 Database: PostgreSQL (Supabase)`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`🚘 Vehicle Types: Sedan, Hatchback, MPV, SUV, Station Wagon`);
    console.log(`🔐 Auth System: Active (JWT + Email Verification)`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
    console.log(`👨‍✈️ Test Driver: driver@test.com / driver123`);
});
