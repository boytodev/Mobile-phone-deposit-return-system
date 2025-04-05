const resultContainer = document.getElementById('scan-result');
let lastScanTime = 0; // ป้องกันการสแกนซ้ำเร็วเกินไป
const scanCooldown = 3000; // 3 วินาที

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    if (now - lastScanTime < scanCooldown) {
        // console.log("Cooldown active, ignoring scan.");
        return; // ยังอยู่ใน cooldown ไม่ต้องทำอะไร
    }
    lastScanTime = now; // อัปเดตเวลาสแกนล่าสุด

    console.log(`Code matched = ${decodedText}`, decodedResult);
    resultContainer.innerHTML = `<div class="info">กำลังประมวลผล: ${decodedText}...</div>`;
    resultContainer.className = 'info'; // Reset class

    // ส่ง studentId ที่ได้ไปให้ Server ผ่าน API /scan
    fetch('/scan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId: decodedText }), // decodedText คือ studentId ที่อ่านได้
    })
    .then(response => response.json())
    .then(data => {
        console.log('Server response:', data);
        if (data.success) {
            resultContainer.innerHTML = `
                <div class="success">
                    <strong>สำเร็จ!</strong> ${data.message} <br>
                    สถานะปัจจุบัน: ${data.status === 'checked-in' ? 'ฝากอยู่' : 'คืนแล้ว'} <br>
                    เวลา: ${new Date(data.timestamp).toLocaleString('th-TH')}
                </div>`;
            resultContainer.className = 'success';
        } else {
            resultContainer.innerHTML = `<div class="error"><strong>ผิดพลาด:</strong> ${data.message}</div>`;
            resultContainer.className = 'error';
        }
        // ทำให้ข้อความผลลัพธ์หายไปหลังจากเวลาผ่านไป (เช่น 5 วินาที)
        setTimeout(() => {
            resultContainer.innerHTML = '';
            resultContainer.className = '';
        }, 5000);
    })
    .catch((error) => {
        console.error('Error sending scan data:', error);
        resultContainer.innerHTML = `<div class="error"><strong>ผิดพลาด:</strong> ไม่สามารถติดต่อ Server ได้</div>`;
        resultContainer.className = 'error';
        setTimeout(() => {
            resultContainer.innerHTML = '';
            resultContainer.className = '';
        }, 5000);
    });

    // Optional: หยุดสแกนชั่วคราวหลังจากสำเร็จ อาจจะไม่ต้องทำถ้ามี cooldown แล้ว
    // html5QrcodeScanner.pause();
    // setTimeout(() => html5QrcodeScanner.resume(), scanCooldown);
}

function onScanFailure(error) {
  // จัดการกับ error ตอนสแกน (อาจจะแสดง log หรือไม่ต้องทำอะไรก็ได้)
  // console.warn(`Code scan error = ${error}`);
}

// --- Initialise the Scanner ---
// ตรวจสอบให้แน่ใจว่า element 'qr-reader' โหลดเสร็จแล้ว
document.addEventListener('DOMContentLoaded', (event) => {
    const qrReaderElement = document.getElementById('qr-reader');
    if(qrReaderElement) {
        const html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader", // ID ของ div ที่จะ render scanner
            {
                fps: 10, // Frames per second ในการสแกน
                qrbox: { width: 250, height: 250 }, // ขนาดของกรอบสแกน (optional)
                rememberLastUsedCamera: true, // จำกล้องล่าสุดที่ใช้
                // supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] // ใช้กล้องเท่านั้น
            },
            /* verbose= */ false // ปิด log ของ library เอง (ถ้าต้องการเปิดเป็น true)
        );
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
         console.log("QR Scanner Initialized");
    } else {
         console.error("Element with id 'qr-reader' not found.");
    }
});