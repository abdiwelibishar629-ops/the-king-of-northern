const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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
// DATABASE CONNECTION
// ============================================================
// Replace with your MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/king-of-northern';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// ============================================================
// MODELS
// ============================================================
const User = require('./models/User');
const Ride = require('./models/Ride');

// ============================================================
// JWT SECRET
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'king-of-northern-secret-key-2024';

// ============================================================
// EMAIL CONFIGURATION (for verification codes)
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

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
// HELPERS
// ============================================================
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// ============================================================
// AUTH APIs
// ============================================================

// ===== REGISTER CUSTOMER =====
app.post('/api/auth/register/customer', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Email or phone already registered' });
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();
        const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create user
        const user = new User({
            fullName,
            email: email.toLowerCase(),
            phone,
            password,
            role: 'customer',
            verificationCode,
            verificationCodeExpires: codeExpires
        });

        await user.save();

        // Send verification email
        await sendVerificationEmail(email, fullName, verificationCode);

        // Send verification SMS (using Twilio or similar)
        // await sendVerificationSMS(phone, verificationCode);

        res.json({
            success: true,
            message: 'Registration successful! Check your email and phone for verification code.',
            userId: user._id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ===== REGISTER DRIVER =====
app.post('/api/auth/register/driver', async (req, res) => {
    try {
        const { fullName, email, phone, password, driverLicense, carModel, carPlate } = req.body;

        // Validate driver fields
        if (!driverLicense || !carModel || !carPlate) {
            return res.status(400).json({ error: 'Driver license, car model, and car plate required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Email or phone already registered' });
        }

        // Check if driver license already used
        const existingDriver = await User.findOne({ driverLicense });
        if (existingDriver) {
            return res.status(400).json({ error: 'Driver license already registered' });
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();
        const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create driver
        const user = new User({
            fullName,
            email: email.toLowerCase(),
            phone,
            password,
            role: 'driver',
            driverLicense,
            carModel,
            carPlate,
            verificationCode,
            verificationCodeExpires: codeExpires
        });

        await user.save();

        // Send verification email
        await sendVerificationEmail(email, fullName, verificationCode);

        res.json({
            success: true,
            message: 'Driver registration successful! Check your email for verification code.',
            userId: user._id
        });

    } catch (error) {
        console.error('Driver registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ===== VERIFY EMAIL/PHONE =====
app.post('/api/auth/verify', async (req, res) => {
    try {
        const { email, phone, code } = req.body;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Email or phone required' });
        }

        const user = await User.findOne({ 
            $or: [{ email: email?.toLowerCase() }, { phone }],
            verificationCode: code,
            verificationCodeExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        user.isVerified = true;
        user.verificationCode = null;
        user.verificationCodeExpires = null;
        await user.save();

        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Verification successful!',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: user.isVerified,
                driverLicense: user.driverLicense,
                carModel: user.carModel,
                carPlate: user.carPlate
            }
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ===== RESEND VERIFICATION CODE =====
app.post('/api/auth/resend-code', async (req, res) => {
    try {
        const { email, phone } = req.body;

        const user = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newCode = generateVerificationCode();
        user.verificationCode = newCode;
        user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendVerificationEmail(user.email, user.fullName, newCode);

        res.json({
            success: true,
            message: 'New verification code sent to your email'
        });

    } catch (error) {
        console.error('Resend code error:', error);
        res.status(500).json({ error: 'Failed to resend code' });
    }
});

// ===== LOGIN =====
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, phone, password } = req.body;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Email or phone required' });
        }

        const user = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isVerified) {
            return res.status(401).json({ error: 'Please verify your account first' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: user.isVerified,
                driverLicense: user.driverLicense,
                carModel: user.carModel,
                carPlate: user.carPlate,
                rating: user.rating
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================================
// HELPERS - Email/SMS
// ============================================================
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
                        <p style="font-size: 16px; line-height: 1.6;">Thank you for registering with King of Northern. Please use the verification code below to complete your registration:</p>
                        <div style="text-align: center; padding: 20px; margin: 20px 0; background: #0f3460; border-radius: 10px; border: 2px solid #f1c40f;">
                            <h1 style="font-size: 40px; letter-spacing: 10px; color: #f1c40f;">${code}</h1>
                        </div>
                        <p style="font-size: 14px; color: #bdc3c7;">This code will expire in <strong style="color: #f1c40f;">10 minutes</strong>.</p>
                        <p style="font-size: 14px; color: #bdc3c7;">If you didn't request this, please ignore this email.</p>
                    </div>
                    <div style="text-align: center; padding: 20px; color: #7f8c8d; font-size: 12px;">
                        <p>© 2024 King of Northern. All rights reserved.</p>
                        <p>Northern Kenya's Premier Ride Hailing Service</p>
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
// RIDE APIs
// ============================================================

// Customer requests a ride
app.post('/api/request-ride', async (req, res) => {
    try {
        const { customerId, pickup, destination, vehicleType } = req.body;

        if (!customerId || !pickup || !destination) {
            return res.status(400).json({ error: 'All fields required' });
        }

        // Check if customer has pending rides
        const pendingRide = await Ride.findOne({ 
            customerId, 
            status: { $in: ['pending', 'confirmed', 'in_progress'] } 
        });

        if (pendingRide) {
            return res.status(400).json({ error: 'You have a pending ride. Please complete it first.' });
        }

        // Find available drivers near the customer (simplified)
        const availableDrivers = await User.find({ 
            role: 'driver', 
            status: 'available',
            isVerified: true
        });

        if (availableDrivers.length === 0) {
            return res.status(404).json({ error: 'No drivers available. Please try again later.' });
        }

        // Select random driver (in real app, would use location-based matching)
        const selectedDriver = availableDrivers[Math.floor(Math.random() * availableDrivers.length)];

        const ride = new Ride({
            customerId,
            customerName: req.body.customerName || 'Customer',
            customerPhone: req.body.phone || '',
            pickup,
            destination,
            vehicleType: vehicleType || 'Any',
            status: 'pending',
            estimatedTime: Math.floor(Math.random() * 10) + 5,
            driverName: selectedDriver.fullName,
            driverPhone: selectedDriver.phone,
            driverPlate: selectedDriver.carPlate,
            driverCar: selectedDriver.carModel
        });

        await ride.save();

        res.json({
            success: true,
            message: `✅ Ride requested! ${selectedDriver.fullName} is on the way.`,
            rideId: ride._id,
            driver: {
                name: selectedDriver.fullName,
                phone: selectedDriver.phone,
                plate: selectedDriver.carPlate,
                car: selectedDriver.carModel,
                rating: selectedDriver.rating
            },
            estimatedTime: ride.estimatedTime
        });

    } catch (error) {
        console.error('Request ride error:', error);
        res.status(500).json({ error: 'Failed to request ride' });
    }
});

// Get ride status
app.get('/api/ride-status/:id', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        res.json(ride);
    } catch (error) {
        console.error('Ride status error:', error);
        res.status(500).json({ error: 'Failed to get ride status' });
    }
});

// ============================================================
// DRIVER APIs
// ============================================================

// Get pending rides for drivers
app.get('/api/driver/requests', async (req, res) => {
    try {
        const pendingRides = await Ride.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(pendingRides);
    } catch (error) {
        console.error('Get pending rides error:', error);
        res.status(500).json({ error: 'Failed to get pending rides' });
    }
});

// Driver confirms a ride
app.post('/api/driver/confirm-ride', async (req, res) => {
    try {
        const { rideId, driverId } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        if (ride.status !== 'pending') {
            return res.status(400).json({ error: 'Ride already confirmed or completed' });
        }

        const driver = await User.findById(driverId);
        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        if (driver.status !== 'available') {
            return res.status(400).json({ error: 'Driver is not available' });
        }

        ride.status = 'confirmed';
        ride.driverId = driverId;
        ride.driverName = driver.fullName;
        ride.driverPhone = driver.phone;
        ride.driverPlate = driver.carPlate;
        ride.driverCar = driver.carModel;
        await ride.save();

        driver.status = 'busy';
        await driver.save();

        res.json({
            success: true,
            message: '✅ Ride confirmed!',
            driver: {
                name: driver.fullName,
                phone: driver.phone,
                plate: driver.carPlate,
                car: driver.carModel,
                rating: driver.rating
            }
        });

    } catch (error) {
        console.error('Confirm ride error:', error);
        res.status(500).json({ error: 'Failed to confirm ride' });
    }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`📱 Auth & Database System: Active`);
});
