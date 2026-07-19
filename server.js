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
// MONGODB CONNECTION - ATLAS
// ============================================================
const MONGODB_URI = 'mongodb+srv://abdiwelibishar629_db_user:t9VJ67LZ3je9BHx4@cluster0.rdb.mongodb.net/king-of-northern';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ============================================================
// SCHEMAS
// ============================================================
const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'driver', 'admin'], required: true },
    driverLicense: { type: String, default: null },
    carModel: { type: String, default: null },
    carPlate: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    verificationCodeExpires: { type: Date, default: null },
    rating: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    status: { type: String, enum: ['available', 'busy', 'offline'], default: 'offline' },
    location: { type: String, default: '' },
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const RideSchema = new mongoose.Schema({
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    pickup: { type: String, required: true },
    destination: { type: String, required: true },
    pickupLat: { type: Number, default: 0 },
    pickupLng: { type: Number, default: 0 },
    destinationLat: { type: Number, default: 0 },
    destinationLng: { type: Number, default: 0 },
    vehicleType: { type: String, default: 'Any' },
    status: { type: String, enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'], default: 'pending' },
    driverName: { type: String, default: null },
    driverPhone: { type: String, default: null },
    driverPlate: { type: String, default: null },
    driverCar: { type: String, default: null },
    estimatedTime: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    fare: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'mpesa', 'card'], default: 'cash' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// ============================================================
// PASSWORD HASHING MIDDLEWARE
// ============================================================
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

UserSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

// ============================================================
// MODELS
// ============================================================
const User = mongoose.model('User', UserSchema);
const Ride = mongoose.model('Ride', RideSchema);

// ============================================================
// JWT SECRET
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'king-of-northern-secret-key-2024';

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
        { id: user._id, email: user.email, role: user.role },
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
        const user = new User({
            fullName,
            email: email.toLowerCase(),
            phone,
            password,
            role: 'customer',
            verificationCode,
            verificationCodeExpires: new Date(Date.now() + 10 * 60000)
        });

        await user.save();
        await sendVerificationEmail(email, fullName, verificationCode);

        res.json({
            success: true,
            message: 'Registration successful! Check your email for verification code.',
            userId: user._id
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email or phone already registered' });
        }
        console.error('Registration error:', error);
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
            verificationCodeExpires: new Date(Date.now() + 10 * 60000),
            status: 'available'
        });

        await user.save();
        await sendVerificationEmail(email, fullName, verificationCode);

        res.json({
            success: true,
            message: 'Driver registration successful! Check your email for verification code.',
            userId: user._id
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email, phone, or license already registered' });
        }
        console.error('Driver registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================================
// AUTH APIs - VERIFY EMAIL/PHONE
// ============================================================
app.post('/api/auth/verify', async (req, res) => {
    const { email, phone, code } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!code || code.length !== 6) {
        return res.status(400).json({ error: 'Please enter a valid 6-digit code' });
    }

    try {
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

// ============================================================
// AUTH APIs - RESEND VERIFICATION CODE
// ============================================================
app.post('/api/auth/resend-code', async (req, res) => {
    const { email, phone } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    try {
        const user = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone }] });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newCode = generateVerificationCode();
        user.verificationCode = newCode;
        user.verificationCodeExpires = new Date(Date.now() + 10 * 60000);
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

// ============================================================
// AUTH APIs - LOGIN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
    const { email, phone, password } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    try {
        const user = await User.findOne({
            $or: [{ email: email?.toLowerCase() }, { phone }]
        });

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
// RIDE APIs - CUSTOMER REQUESTS A RIDE
// ============================================================
app.post('/api/request-ride', async (req, res) => {
    const { customerId, customerName, phone, pickup, destination, vehicleType } = req.body;

    if (!customerId || !pickup || !destination) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        // Check if customer has pending rides
        const pendingRide = await Ride.findOne({
            customerId,
            status: { $in: ['pending', 'confirmed', 'in_progress'] }
        });

        if (pendingRide) {
            return res.status(400).json({ error: 'You have a pending ride. Please complete it first.' });
        }

        // Find available driver
        const driver = await User.findOne({
            role: 'driver',
            status: 'available',
            isVerified: true
        });

        if (!driver) {
            return res.status(404).json({ error: 'No drivers available. Please try again later.' });
        }

        const estimatedTime = Math.floor(Math.random() * 10) + 5;

        const ride = new Ride({
            customerId,
            customerName: customerName || 'Customer',
            customerPhone: phone || '',
            pickup,
            destination,
            vehicleType: vehicleType || 'Any',
            status: 'pending',
            driverName: driver.fullName,
            driverPhone: driver.phone,
            driverPlate: driver.carPlate,
            driverCar: driver.carModel,
            estimatedTime
        });

        await ride.save();

        // Update driver status
        driver.status = 'busy';
        await driver.save();

        res.json({
            success: true,
            message: `✅ Ride requested! ${driver.fullName} is on the way.`,
            rideId: ride._id,
            driver: {
                name: driver.fullName,
                phone: driver.phone,
                plate: driver.carPlate,
                car: driver.carModel,
                rating: driver.rating
            },
            estimatedTime
        });
    } catch (error) {
        console.error('Request ride error:', error);
        res.status(500).json({ error: 'Failed to request ride' });
    }
});

// ============================================================
// RIDE APIs - GET RIDE STATUS
// ============================================================
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
// DRIVER APIs - GET PENDING RIDES
// ============================================================
app.get('/api/driver/requests', async (req, res) => {
    try {
        const rides = await Ride.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(rides);
    } catch (error) {
        console.error('Get pending rides error:', error);
        res.status(500).json({ error: 'Failed to get pending rides' });
    }
});

// ============================================================
// DRIVER APIs - CONFIRM RIDE
// ============================================================
app.post('/api/driver/confirm-ride', async (req, res) => {
    const { rideId, driverId } = req.body;

    if (!rideId || !driverId) {
        return res.status(400).json({ error: 'Ride ID and Driver ID required' });
    }

    try {
        const ride = await Ride.findById(rideId);
        if (!ride || ride.status !== 'pending') {
            return res.status(400).json({ error: 'Ride already confirmed or completed' });
        }

        const driver = await User.findById(driverId);
        if (!driver || driver.status !== 'available') {
            return res.status(400).json({ error: 'Driver not available' });
        }

        ride.status = 'confirmed';
        ride.driverId = driverId;
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
                car: driver.carModel
            }
        });
    } catch (error) {
        console.error('Confirm ride error:', error);
        res.status(500).json({ error: 'Failed to confirm ride' });
    }
});

// ============================================================
// DRIVER APIs - COMPLETE RIDE
// ============================================================
app.post('/api/driver/complete-ride', async (req, res) => {
    const { rideId, driverId } = req.body;

    if (!rideId || !driverId) {
        return res.status(400).json({ error: 'Ride ID and Driver ID required' });
    }

    try {
        const ride = await Ride.findById(rideId);
        if (!ride || ride.status !== 'confirmed') {
            return res.status(400).json({ error: 'Ride not found or already completed' });
        }

        ride.status = 'completed';
        ride.completedAt = new Date();
        await ride.save();

        await User.findByIdAndUpdate(driverId, { status: 'available' });

        res.json({
            success: true,
            message: '✅ Ride completed!'
        });
    } catch (error) {
        console.error('Complete ride error:', error);
        res.status(500).json({ error: 'Failed to complete ride' });
    }
});

// ============================================================
// DRIVER APIs - GET ALL DRIVERS
// ============================================================
app.get('/api/drivers', async (req, res) => {
    try {
        const drivers = await User.find(
            { role: 'driver' },
            'fullName phone carModel carPlate status rating'
        );
        res.json(drivers);
    } catch (error) {
        console.error('Get drivers error:', error);
        res.status(500).json({ error: 'Failed to get drivers' });
    }
});

// ============================================================
// ADMIN APIs - GET ALL USERS
// ============================================================
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, 'fullName email phone role isVerified status createdAt');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// ============================================================
// ADMIN APIs - GET ALL RIDES
// ============================================================
app.get('/api/admin/rides', async (req, res) => {
    try {
        const rides = await Ride.find({})
            .sort({ createdAt: -1 })
            .populate('customerId', 'fullName phone')
            .populate('driverId', 'fullName phone');
        res.json(rides);
    } catch (error) {
        console.error('Get rides error:', error);
        res.status(500).json({ error: 'Failed to get rides' });
    }
});

// ============================================================
// ADMIN APIs - GET STATS
// ============================================================
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalDrivers = await User.countDocuments({ role: 'driver' });
        const totalCustomers = await User.countDocuments({ role: 'customer' });
        const totalRides = await Ride.countDocuments();
        const pendingRides = await Ride.countDocuments({ status: 'pending' });
        const completedRides = await Ride.countDocuments({ status: 'completed' });
        
        res.json({
            totalUsers,
            totalDrivers,
            totalCustomers,
            totalRides,
            pendingRides,
            completedRides
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`📊 Database: MongoDB Atlas (king-of-northern)`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`🚘 Vehicle Types: Sedan, Hatchback, MPV, SUV, Station Wagon`);
    console.log(`🔐 Auth System: Active (JWT + Email Verification)`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
});
