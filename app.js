require('dotenv').config(); // โหลด .env เข้า process.env
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const indexRoutes = require('./routes/index');
const studentRoutes = require('./routes/students');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI, {
    // useNewUrlParser: true, // ไม่จำเป็นใน Mongoose v6+
    // useUnifiedTopology: true // ไม่จำเป็นใน Mongoose v6+
})
.then(() => console.log('MongoDB Connected successfully.'))
.catch(err => console.error('MongoDB Connection Error:', process.env.MONGO_URI, err));

// --- Middleware ---
app.set('view engine', 'ejs'); // ตั้งค่า EJS เป็น Template Engine
app.set('views', path.join(__dirname, 'views')); // กำหนดโฟลเดอร์ views
app.use(express.json()); // สำหรับ Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // สำหรับ Parse URL-encoded bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (CSS, JS)

// --- Routes ---
app.use('/', indexRoutes); // ใช้ Routes จาก routes/index.js สำหรับ path หลัก
app.use('/students', studentRoutes); // ใช้ Routes จาก routes/students.js สำหรับ /students
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (CSS, JS)
// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});