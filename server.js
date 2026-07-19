const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================================
// MYSQL DATABASE CONNECTION
// ============================================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // XAMPP default is empty
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
const JWT_SECRET = 'king-of-northern-secret-key-2024';

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
// EMAIL CONFIGURATION (for verification)
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

async function sendVerificationEmail(email, name, code) {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'no-reply@kingofnorthern.com',
            to: email,
            subject: '🔐 King of Northern - Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: white; border-radius: 10px;">
                    <div style="text-align: center; padding: 20px 0;">
                        <h1 style="color: #f1c40f;">👑 King of Northern</h1>
                    </div>
                    <div style="background: #16213e; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #f1c40f;">Hello ${name}! 👋</h2>
                        <p style="font-size: 16px; line-height: 1.6;">Thank you for registering. Please use the verification code below:</p>
                        <div style="text-align: center; padding: 20px; margin: 20px 0; background: #0f3460; border-radius: 10px; border: 2px solid #f1c40f;">
                            <h1 style="font-size: 40px; letter-spacing: 10px; color: #f1c40f;">${code}</h1>
                        </div>
                        <p style="font-size: 14px; color: #bdc3c7;">This code will expire in <strong style="color: #f1c40f;">10 minutes</strong>.</p>
                    </div>
                    <div style="text-align: center; padding: 20px; color: #7f8c8d; font-size: 12px;">
                        <p>© 2024 King of Northern. All rights reserved.</p>
                    </div>
                </div>
            `
        });
        console.log('✅ Verification email sent to:', email);
    } catch (error) {
        console.error('❌ Email send error:', error);
    }
}

// ============================================================
// AUTH APIs - CUSTOMER REGISTRATION
// ============================================================
app.post('/api/auth/register/customer', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const verificationCode = generateVerificationCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users 
            (full_name, email, phone, password, role, verification_code, verification_code_expires) 
            VALUES (?, ?, ?, ?, 'customer', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`;

        db.query(sql, [fullName, email, phone, hashedPassword, verificationCode], async (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email or phone already registered' });
                }
                console.error('Registration error:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            // Send verification email
            await sendVerificationEmail(email, fullName, verificationCode);

            res.json({
                success: true,
                message: 'Registration successful! Check your email for verification code.',
                userId: result.insertId
            });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================
// AUTH APIs - DRIVER REGISTRATION
// ============================================================
app.post('/api/auth/register/driver', async (req, res) => {
    const { fullName, email, phone, password, driverLicense, carModel, carPlate } = req.body;

    if (!fullName || !email || !phone || !password || !driverLicense || !carModel || !carPlate) {
        return res.status(400).json({ error: 'All fields required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const verificationCode = generateVerificationCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users 
            (full_name, email, phone, password, role, driver_license, car_model, car_plate, verification_code, verification_code_expires) 
            VALUES (?, ?, ?, ?, 'driver', ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`;

        db.query(sql, [fullName, email, phone, hashedPassword, driverLicense, carModel, carPlate, verificationCode], async (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email, phone, or license already registered' });
                }
                console.error('Registration error:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }

            await sendVerificationEmail(email, fullName, verificationCode);

            res.json({
                success: true,
                message: 'Driver registration successful! Check your email for verification code.',
                userId: result.insertId
            });
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================
// AUTH APIs - VERIFY EMAIL/PHONE
// ============================================================
app.post('/api/auth/verify', (req, res) => {
    const { email, phone, code } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!code || code.length !== 6) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit code' });
    }

    const sql = `SELECT * FROM users WHERE (email = ? OR phone = ?) 
        AND verification_code = ? AND verification_code_expires > NOW()`;

    db.query(sql, [email, phone, code], async (err, users) => {
        if (err) {
            console.error('Verification error:', err);
            return res.status(500).json({ error: 'Verification failed' });
        }

        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        const user = users[0];
        const updateSql = `UPDATE users SET is_verified = TRUE, verification_code = NULL, verification_code_expires = NULL WHERE id = ?`;
        
        db.query(updateSql, [user.id], (err2) => {
            if (err2) {
                console.error('Update error:', err2);
                return res.status(500).json({ error: 'Verification failed' });
            }

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
        });
    });
});

// ============================================================
// AUTH APIs - RESEND VERIFICATION CODE
// ============================================================
app.post('/api/auth/resend-code', async (req, res) => {
    const { email, phone } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    const sql = `SELECT * FROM users WHERE email = ? OR phone = ?`;

    db.query(sql, [email, phone], async (err, users) => {
        if (err || users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const newCode = generateVerificationCode();

        const updateSql = `UPDATE users SET verification_code = ?, verification_code_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?`;
        
        db.query(updateSql, [newCode, user.id], async (err2) => {
            if (err2) {
                return res.status(500).json({ error: 'Failed to resend code' });
            }

            await sendVerificationEmail(user.email, user.full_name, newCode);

            res.json({
                success: true,
                message: 'New verification code sent to your email'
            });
        });
    });
});

// ============================================================
// AUTH APIs - LOGIN
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { email, phone, password } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    const sql = `SELECT * FROM users WHERE email = ? OR phone = ?`;

    db.query(sql, [email, phone], async (err, users) => {
        if (err || users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        if (!user.is_verified) {
            return res.status(401).json({ error: 'Please verify your account first' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
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
                carPlate: user.car_plate,
                rating: user.rating
            }
        });
    });
});

// ============================================================
// RIDE APIs - CUSTOMER REQUESTS A RIDE
// ============================================================
app.post('/api/request-ride', (req, res) => {
    const { customerId, customerName, phone, pickup, destination, vehicleType } = req.body;

    if (!customerId || !pickup || !destination) {
        return res.status(400).json({ error: 'All fields required' });
    }

    // Check if customer has pending rides
    const checkSql = `SELECT * FROM rides WHERE customer_id = ? AND status IN ('pending', 'confirmed', 'in_progress')`;

    db.query(checkSql, [customerId], (err, pending) => {
        if (err) {
            console.error('Check pending error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (pending.length > 0) {
            return res.status(400).json({ error: 'You have a pending ride. Please complete it first.' });
        }

        // Find available driver
        const driverSql = `SELECT * FROM users WHERE role = 'driver' AND status = 'available' AND is_verified = TRUE LIMIT 1`;

        db.query(driverSql, (err2, drivers) => {
            if (err2 || drivers.length === 0) {
                return res.status(404).json({ error: 'No drivers available. Please try again later.' });
            }

            const driver = drivers[0];
            const estimatedTime = Math.floor(Math.random() * 10) + 5;

            const rideSql = `INSERT INTO rides 
                (customer_id, customer_name, customer_phone, pickup, destination, vehicle_type, 
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

                // Update driver status
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
                    estimatedTime: estimatedTime
                });
            });
        });
    });
});

// ============================================================
// RIDE APIs - GET RIDE STATUS
// ============================================================
app.get('/api/ride-status/:id', (req, res) => {
    const sql = `SELECT * FROM rides WHERE id = ?`;
    db.query(sql, [req.params.id], (err, rides) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (rides.length === 0) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        res.json(rides[0]);
    });
});

// ============================================================
// DRIVER APIs - GET PENDING RIDES
// ============================================================
app.get('/api/driver/requests', (req, res) => {
    const sql = `SELECT * FROM rides WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`;
    db.query(sql, (err, rides) => {
        if (err) {
            console.error('Get pending rides error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rides);
    });
});

// ============================================================
// DRIVER APIs - CONFIRM RIDE
// ============================================================
app.post('/api/driver/confirm-ride', (req, res) => {
    const { rideId, driverId } = req.body;

    if (!rideId || !driverId) {
        return res.status(400).json({ error: 'Ride ID and Driver ID required' });
    }

    // Check if ride is still pending
    const checkSql = `SELECT * FROM rides WHERE id = ? AND status = 'pending'`;
    
    db.query(checkSql, [rideId], (err, rides) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (rides.length === 0) {
            return res.status(400).json({ error: 'Ride already confirmed or completed' });
        }

        const updateSql = `UPDATE rides SET status = 'confirmed', driver_id = ? WHERE id = ?`;
        
        db.query(updateSql, [driverId, rideId], (err2, result) => {
            if (err2) {
                return res.status(500).json({ error: 'Failed to confirm ride' });
            }

            if (result.affectedRows === 0) {
                return res.status(400).json({ error: 'Ride already confirmed or completed' });
            }

            // Update driver status
            db.query(`UPDATE users SET status = 'busy' WHERE id = ?`, [driverId]);

            // Get ride details
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

// ============================================================
// DRIVER APIs - COMPLETE RIDE
// ============================================================
app.post('/api/driver/complete-ride', (req, res) => {
    const { rideId, driverId } = req.body;

    if (!rideId || !driverId) {
        return res.status(400).json({ error: 'Ride ID and Driver ID required' });
    }

    const updateSql = `UPDATE rides SET status = 'completed' WHERE id = ? AND driver_id = ? AND status = 'confirmed'`;
    
    db.query(updateSql, [rideId, driverId], (err, result) => {
        if (err) {
            console.error('Complete ride error:', err);
            return res.status(500).json({ error: 'Failed to complete ride' });
        }

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Ride not found or already completed' });
        }

        // Update driver status back to available
        db.query(`UPDATE users SET status = 'available' WHERE id = ?`, [driverId]);

        res.json({
            success: true,
            message: '✅ Ride completed!'
        });
    });
});

// ============================================================
// DRIVER APIs - GET ALL DRIVERS
// ============================================================
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
// ADMIN APIs - GET ALL USERS
// ============================================================
app.get('/api/admin/users', (req, res) => {
    const sql = `SELECT id, full_name, email, phone, role, is_verified, status, created_at FROM users`;
    db.query(sql, (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

// ============================================================
// ADMIN APIs - GET ALL RIDES
// ============================================================
app.get('/api/admin/rides', (req, res) => {
    const sql = `SELECT * FROM rides ORDER BY created_at DESC`;
    db.query(sql, (err, rides) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rides);
    });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`📊 Database: MySQL (king_of_northern)`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`🚘 Vehicle Types: Sedan, Hatchback, MPV, SUV, Station Wagon`);
    console.log(`🔐 Auth System: Active (JWT + Email Verification)`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
});
