const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const PhoneLog = require("../models/PhoneLog");
const fs = require("fs");
const path = require("path");

const logDirectory = path.join(__dirname, "..", "logs"); // สร้างโฟลเดอร์ logs ใน root project
const logFilePath = path.join(logDirectory, "scan_transactions.csv"); // ชื่อไฟล์ log
const csvHeader =
  "Timestamp,StudentID,FirstName,LastName,Action,ResultingStatus\n"; // หัวข้อคอลัมน์ใน CSV

// --- Function ช่วย Escape ค่าสำหรับ CSV (ป้องกันปัญหาถ้าข้อมูลมี comma หรือ quote) ---
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ""; // คืนค่าว่างถ้าเป็น null/undefined
  }
  const stringValue = String(value); // แปลงเป็น String
  // ถ้ามี comma, newline, หรือ double quote ให้ครอบด้วย double quote
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    // และถ้ามี double quote อยู่แล้ว ให้เปลี่ยนเป็น double quote สองตัว (ตามมาตรฐาน CSV)
    const escapedValue = stringValue.replace(/"/g, '""');
    return `"${escapedValue}"`;
  }
  // ถ้าไม่มีอักขระพิเศษ ก็คืนค่าเดิม
  return stringValue;
}

// --- แสดงหน้าหลัก (หน้าสแกน) ---
router.get("/", (req, res) => {
  res.render("index", { title: "ระบบฝาก-คืนมือถือ" });
});

router.get("/status", async (req, res) => {
  try {
    // 1. ดึงข้อมูล Log ทั้งหมดจากฐานข้อมูล
    // 2. ใช้ .populate('student') เพื่อดึงข้อมูลของนักเรียนที่เชื่อมโยงกันมาด้วย (ชื่อ, รหัส)
    // 3. ใช้ .sort({ updatedAt: -1 }) เพื่อเรียงลำดับตามเวลาล่าสุดที่ข้อมูลถูกอัปเดต (แสดงรายการล่าสุดก่อน)
    const logs = await PhoneLog.find()
      .populate("student", "studentId firstName lastName") // ดึงเฉพาะ field ที่ต้องการจาก Student
      .sort({ updatedAt: -1 });

    // Render View ใหม่ชื่อ 'status.ejs' พร้อมส่งข้อมูล logs ไปแสดงผล
    res.render("status", {
      title: "ข้อมูลสถานะการฝาก-คืนมือถือ",
      logs: logs,
      currentDate: new Date(), // ส่งวันที่ปัจจุบันไปด้วย (ถ้าต้องการ)
    });
  } catch (err) {
    console.error("Error fetching status logs:", err);
    res.status(500).render("error_page", {
      // (Optional) สร้างหน้า error_page.ejs
      title: "เกิดข้อผิดพลาด",
      message: "ไม่สามารถดึงข้อมูลสถานะการฝาก-คืนได้",
    });
    // หรือส่งข้อความธรรมดา: res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลสถานะ");
  }
});
// --- API Endpoint สำหรับรับข้อมูลจากการสแกน QR Code ---
// ในไฟล์ routes/index.js

router.post("/scan", async (req, res) => {
  const { studentId } = req.body;

  if (!studentId) {
    return res
      .status(400)
      .json({ success: false, message: "ไม่พบข้อมูลรหัสนักเรียน" });
  }

  try {
    // --- ค้นหานักเรียน ---
    const student = await Student.findOne({ studentId: studentId });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: `ไม่พบนักเรียนรหัส ${studentId}` });
    }

    // --- ค้นหา/สร้าง/อัปเดต PhoneLog ---
    let phoneLog = await PhoneLog.findOne({ student: student._id });
    let action = "";
    let message = "";
    const now = new Date(); // ใช้เวลาเดียวกันทั้งใน DB และ Log

    if (phoneLog) {
      if (phoneLog.status === "checked-out") {
        // Check-in
        phoneLog.status = "checked-in";
        phoneLog.lastCheckInTime = now;
        phoneLog.lastCheckOutTime = null;
        action = "check-in";
        message = `รับฝากมือถือของ ${student.firstName} ${student.lastName} เรียบร้อย`;
      } else {
        // Check-out
        phoneLog.status = "checked-out";
        phoneLog.lastCheckOutTime = now;
        action = "check-out";
        message = `คืนมือถือให้ ${student.firstName} ${student.lastName} เรียบร้อย`;
      }
    } else {
      // First check-in
      phoneLog = new PhoneLog({
        student: student._id,
        status: "checked-in",
        lastCheckInTime: now,
      });
      action = "check-in";
      message = `รับฝากมือถือของ ${student.firstName} ${student.lastName} (ครั้งแรก) เรียบร้อย`;
    }

    // --- บันทึกข้อมูลลง MongoDB ---
    await phoneLog.save();
    const finalStatus = phoneLog.status; // เก็บ status ล่าสุดหลัง save

    // --- !!! เพิ่มส่วนการบันทึกลงไฟล์ CSV !!! ---
    try {
      // 1. สร้างข้อมูลสำหรับบันทึก 1 แถว
      const timestampStr = now.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
      }); // เวลาไทย
      const csvRow =
        [
          escapeCsvValue(timestampStr),
          escapeCsvValue(student.studentId),
          escapeCsvValue(student.firstName),
          escapeCsvValue(student.lastName),
          escapeCsvValue(action), // 'check-in' or 'check-out'
          escapeCsvValue(finalStatus), // สถานะ *หลังจาก* ทำ action นี้
        ].join(",") + "\n"; // รวมเป็น String คั่นด้วย comma และขึ้นบรรทัดใหม่

      // 2. ตรวจสอบและสร้างโฟลเดอร์ logs ถ้ายังไม่มี
      if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
        console.log(`Created log directory: ${logDirectory}`);
      }

      // 3. ตรวจสอบว่าไฟล์ CSV มีหรือยัง ถ้ายังไม่มี ให้เขียน Header ก่อน
      if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, csvHeader, "utf8");
        console.log(`CSV Header written to: ${logFilePath}`);
      }

      // 4. เขียนข้อมูลแถวใหม่ต่อท้ายไฟล์ (Append) แบบ Asynchronous
      fs.appendFile(logFilePath, csvRow, "utf8", (err) => {
        if (err) {
          // สำคัญ: Log error แต่ *ไม่ควร* ทำให้ request หลักล่ม
          console.error("Error writing transaction to CSV:", err);
        } else {
          // console.log('Transaction logged to CSV successfully.'); // Optional: แสดง log ว่าเขียนสำเร็จ
        }
      });
    } catch (fileError) {
      // จัดการ Error ที่เกี่ยวกับการเขียนไฟล์ (เช่น permission denied)
      console.error("Error during CSV file operation:", fileError);
    }
    // --- !!! จบส่วนการบันทึกลงไฟล์ CSV !!! ---

    // --- ส่ง Response กลับไปให้ Client (เหมือนเดิม) ---
    return res.json({
      success: true,
      message: message,
      studentName: `${student.firstName} ${student.lastName}`,
      action: action,
      status: finalStatus,
      timestamp:
        action === "check-in"
          ? phoneLog.lastCheckInTime
          : phoneLog.lastCheckOutTime,
    });
  } catch (dbError) {
    // เปลี่ยนชื่อ error variable เล็กน้อยเพื่อความชัดเจน
    console.error("Error processing scan (DB operation):", dbError);
    return res
      .status(500)
      .json({
        success: false,
        message: "เกิดข้อผิดพลาดในระบบขณะประมวลผล (ฐานข้อมูล)",
      });
  }
});

module.exports = router; // อย่าลืม Export router
