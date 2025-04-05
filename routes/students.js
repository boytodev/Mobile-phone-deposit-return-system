const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const QRCode = require('qrcode');

// --- แสดงฟอร์มเพิ่มนักเรียน ---
router.get('/add', (req, res) => {
    res.render('add_student', { title: 'เพิ่มนักเรียน' });
});

// --- จัดการการเพิ่มนักเรียน (POST) ---
router.post('/add', async (req, res) => {
    const { studentId, firstName, lastName, grade } = req.body;
    // Basic validation
    if (!studentId || !firstName || !lastName) {
        return res.render('add_student', {
            title: 'เพิ่มนักเรียน',
            error: 'กรุณากรอกข้อมูลให้ครบ: รหัสนักเรียน, ชื่อ, นามสกุล'
        });
    }
    try {
        const existingStudent = await Student.findOne({ studentId: studentId });
        if (existingStudent) {
            return res.render('add_student', {
                title: 'เพิ่มนักเรียน',
                error: `มีรหัสนักเรียน ${studentId} อยู่ในระบบแล้ว`
            });
        }
        const newStudent = new Student({ studentId, firstName, lastName, grade });
        await newStudent.save();
        // Redirect ไปหน้ารายละเอียดนักเรียนที่เพิ่งเพิ่ม
        res.redirect(`/students/${newStudent.studentId}`);
    } catch (err) {
        console.error("Error adding student:", err);
        res.render('add_student', { title: 'เพิ่มนักเรียน', error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// --- แสดงรายชื่อนักเรียนทั้งหมด ---
router.get('/', async (req, res) => {
    try {
        const students = await Student.find().sort({ studentId: 1 }); // เรียงตามรหัสนักเรียน
        res.render('students', { title: 'รายชื่อนักเรียน', students: students });
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน");
    }
});

// --- แสดงรายละเอียดนักเรียน + QR Code ---
router.get('/:studentId', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.studentId });
        if (!student) {
            return res.status(404).send('ไม่พบนักเรียน');
        }

        // สร้าง QR Code เป็น Data URL
        const qrCodeDataUrl = await QRCode.toDataURL(student.studentId);

        res.render('student_detail', {
            title: `รายละเอียด ${student.firstName}`,
            student: student,
            qrCodeDataUrl: qrCodeDataUrl
        });
    } catch (err) {
        console.error("Error fetching student detail:", err);
        res.status(500).send("เกิดข้อผิดพลาด");
    }
});

module.exports = router;