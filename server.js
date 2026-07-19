const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================================
// PWA SUPPORT - Serve Service Worker with proper headers
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

// ============================================================
// VEHICLES & DRIVERS DATA
// ============================================================
const drivers = [
    { 
        id: 1, 
        name: 'Ahmed Hassan', 
        phone: '0712345678', 
        plate: 'KCA 123A', 
        car: 'Toyota Probox', 
        type: 'Sedan',
        seats: 4,
        capacity: '4 Passengers',
        status: 'available', 
        location: 'Garissa', 
        rating: 4.8,
        lat: -0.4167,
        lng: 39.6333
    },
    { 
        id: 2, 
        name: 'Fatuma Ali', 
        phone: '0723456789', 
        plate: 'KDA 456B', 
        car: 'Nissan Note', 
        type: 'Hatchback',
        seats: 5,
        capacity: '5 Passengers',
        status: 'available', 
        location: 'Wajir', 
        rating: 4.9,
        lat: 1.7500,
        lng: 40.0667
    },
    { 
        id: 3, 
        name: 'Omar Abdi', 
        phone: '0734567890', 
        plate: 'KEA 789C', 
        car: 'Toyota Sienta', 
        type: 'MPV',
        seats: 7,
        capacity: '7 Passengers',
        status: 'available', 
        location: 'Mandera', 
        rating: 4.7,
        lat: 3.9167,
        lng: 41.8667
    },
    { 
        id: 4, 
        name: 'Halima Ibrahim', 
        phone: '0745678901', 
        plate: 'KFA 012D', 
        car: 'Honda Fit', 
        type: 'Hatchback',
        seats: 4,
        capacity: '4 Passengers',
        status: 'available', 
        location: 'Lodwar', 
        rating: 4.6,
        lat: 3.1167,
        lng: 35.6000
    },
    { 
        id: 5, 
        name: 'Abdirahman Said', 
        phone: '0756789012', 
        plate: 'KGA 345E', 
        car: 'Toyota Probox', 
        type: 'Sedan',
        seats: 4,
        capacity: '4 Passengers',
        status: 'available', 
        location: 'Isiolo', 
        rating: 4.9,
        lat: 0.3500,
        lng: 37.5833
    },
    { 
        id: 6, 
        name: 'Muna Adan', 
        phone: '0767890123', 
        plate: 'KHA 678F', 
        car: 'Toyota Vitz', 
        type: 'Hatchback',
        seats: 4,
        capacity: '4 Passengers',
        status: 'available', 
        location: 'Marsabit', 
        rating: 4.8,
        lat: 2.3333,
        lng: 37.9833
    },
    { 
        id: 7, 
        name: 'Hassan Noor', 
        phone: '0778901234', 
        plate: 'KJA 901G', 
        car: 'Nissan Wingroad', 
        type: 'Station Wagon',
        seats: 5,
        capacity: '5 Passengers',
        status: 'available', 
        location: 'Moyale', 
        rating: 4.7,
        lat: 3.5333,
        lng: 39.0500
    },
    { 
        id: 8, 
        name: 'Amina Osman', 
        phone: '0789012345', 
        plate: 'KLA 234H', 
        car: 'Toyota Premio', 
        type: 'Sedan',
        seats: 5,
        capacity: '5 Passengers',
        status: 'available', 
        location: 'Turbi', 
        rating: 4.9,
        lat: 3.2000,
        lng: 39.0667
    },
    { 
        id: 9, 
        name: 'Mohamed Duale', 
        phone: '0790123456', 
        plate: 'KMA 567J', 
        car: 'Toyota RAV4', 
        type: 'SUV',
        seats: 5,
        capacity: '5 Passengers',
        status: 'available', 
        location: 'Garissa', 
        rating: 4.8,
        lat: -0.4167,
        lng: 39.6333
    },
    { 
        id: 10, 
        name: 'Asha Abdi', 
        phone: '0712345679', 
        plate: 'KNA 890K', 
        car: 'Land Cruiser', 
        type: 'SUV',
        seats: 7,
        capacity: '7 Passengers',
        status: 'available', 
        location: 'Mandera', 
        rating: 4.9,
        lat: 3.9167,
        lng: 41.8667
    }
];

let rideRequests = [];
let requestId = 1;
let sessions = {};
let activeRides = [];

// ============================================================
// HELPER FUNCTION - Calculate distance between two coordinates (in km)
// ============================================================
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ============================================================
// CUSTOMER APIs
// ============================================================

// Customer requests a ride - finds nearby drivers
app.post('/api/request-ride', (req, res) => {
    const { customerName, phone, pickup, destination, vehicleType } = req.body;

    if (!customerName || !phone || !pickup || !destination) {
        return res.status(400).json({ error: 'All fields required' });
    }

    const customerLat = -0.4167;
    const customerLng = 39.6333;

    const nearbyDrivers = drivers.filter(d => {
        if (d.status !== 'available') return false;
        if (vehicleType && d.type !== vehicleType) return false;
        const distance = getDistance(customerLat, customerLng, d.lat, d.lng);
        return distance <= 50;
    });

    if (nearbyDrivers.length === 0) {
        return res.status(404).json({ 
            error: 'No nearby drivers available. Please try again later.',
            nearbyDrivers: []
        });
    }

    nearbyDrivers.sort((a, b) => {
        const distA = getDistance(customerLat, customerLng, a.lat, a.lng);
        const distB = getDistance(customerLat, customerLng, b.lat, b.lng);
        return distA - distB;
    });

    const selectedDriver = nearbyDrivers[0];
    const distance = getDistance(customerLat, customerLng, selectedDriver.lat, selectedDriver.lng);
    const estimatedTime = Math.round(distance / 30 * 60) + 5;

    const request = {
        id: requestId++,
        customerName,
        phone,
        pickup,
        destination,
        vehicleType: vehicleType || 'Any',
        status: 'pending',
        timestamp: new Date().toISOString(),
        driver: {
            id: selectedDriver.id,
            name: selectedDriver.name,
            phone: selectedDriver.phone,
            plate: selectedDriver.plate,
            car: selectedDriver.car,
            type: selectedDriver.type,
            seats: selectedDriver.seats,
            capacity: selectedDriver.capacity,
            rating: selectedDriver.rating,
            location: selectedDriver.location,
            distance: distance.toFixed(1) + 'km'
        },
        nearbyDrivers: nearbyDrivers.map(d => ({
            id: d.id,
            name: d.name,
            car: d.car,
            type: d.type,
            plate: d.plate,
            rating: d.rating,
            distance: getDistance(customerLat, customerLng, d.lat, d.lng).toFixed(1) + 'km'
        })),
        estimatedTime: estimatedTime
    };

    rideRequests.push(request);
    selectedDriver.status = 'busy';

    res.json({
        success: true,
        message: `✅ Ride requested! ${selectedDriver.name} is on the way.`,
        requestId: request.id,
        driver: request.driver,
        nearbyDrivers: request.nearbyDrivers,
        estimatedTime: request.estimatedTime,
        vehicleType: request.vehicleType
    });
});

// Customer checks ride status
app.get('/api/ride-status/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const request = rideRequests.find(r => r.id === id);
    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }
    res.json(request);
});

// ============================================================
// DRIVER APIs
// ============================================================

// Driver login
app.post('/api/driver-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'driver' && password === 'driver123') {
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessions[token] = { role: 'driver', username };
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// Get all pending ride requests
app.get('/api/driver/requests', (req, res) => {
    const pending = rideRequests.filter(r => r.status === 'pending');
    res.json(pending);
});

// Driver confirms a ride
app.post('/api/driver/confirm-ride', (req, res) => {
    const { requestId, driverId } = req.body;
    
    const request = rideRequests.find(r => r.id === requestId);
    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({ error: 'Ride already confirmed or completed' });
    }

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
    }

    if (driver.status !== 'available') {
        return res.status(400).json({ error: 'Driver is not available' });
    }

    request.status = 'confirmed';
    request.driverConfirmed = true;
    driver.status = 'busy';

    activeRides.push({
        requestId: request.id,
        driverId: driver.id,
        startedAt: new Date().toISOString()
    });

    res.json({
        success: true,
        message: '✅ Ride confirmed!',
        driver: {
            name: driver.name,
            phone: driver.phone,
            plate: driver.plate,
            car: driver.car,
            type: driver.type,
            seats: driver.seats,
            capacity: driver.capacity,
            rating: driver.rating
        }
    });
});

// Driver completes a ride
app.post('/api/driver/complete-ride', (req, res) => {
    const { requestId, driverId } = req.body;
    
    const request = rideRequests.find(r => r.id === requestId);
    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'confirmed') {
        return res.status(400).json({ error: 'Ride not yet confirmed' });
    }

    request.status = 'completed';
    
    const driver = drivers.find(d => d.id === driverId);
    if (driver) {
        driver.status = 'available';
    }

    activeRides = activeRides.filter(r => r.requestId !== requestId);

    res.json({ success: true, message: '✅ Ride completed!' });
});

// Get available vehicle types
app.get('/api/vehicle-types', (req, res) => {
    const types = [...new Set(drivers.map(d => d.type))];
    res.json(types);
});

// Get all drivers (for admin/monitoring)
app.get('/api/drivers', (req, res) => {
    const safeDrivers = drivers.map(d => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        plate: d.plate,
        car: d.car,
        type: d.type,
        seats: d.seats,
        capacity: d.capacity,
        status: d.status,
        location: d.location,
        rating: d.rating,
        lat: d.lat,
        lng: d.lng
    }));
    res.json(safeDrivers);
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`👑 THE KING OF NORTHERN - Server running on port ${PORT}`);
    console.log(`🚗 Drivers Available: ${drivers.filter(d => d.status === 'available').length}`);
    console.log(`📍 Service Area: Northern Kenya`);
    console.log(`🚘 Vehicle Types: Sedan, Hatchback, MPV, SUV, Station Wagon`);
    console.log(`📱 PWA Support: Enabled`);
});
