// --- Data Initializer ---
let students = JSON.parse(localStorage.getItem('absensi_students')) || [];
let classes = JSON.parse(localStorage.getItem('absensi_classes')) || ["X IPA 1", "X IPS 1"];
let attendanceLogs = JSON.parse(localStorage.getItem('absensi_logs')) || [];
let schoolProfile = JSON.parse(localStorage.getItem('absensi_school')) || { name: "SMA Harapan Bangsa", address: "Jl. Pendidikan No. 123" };

let html5Qrcode = null;         // instance kamera aktif (dari class Html5Qrcode, BUKAN Html5QrcodeScanner)
let isScannerBusy = false;      // mencegah start/stop tumpang tindih
let isProcessingScan = false;   // mencegah 1 QR yang sama diproses berkali-kali
let lastSnapshotDataUrl = null; // foto terakhir hasil snapshot
let lastLogForPhoto = null;     // data siswa/waktu terakhir yang difoto

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    updateSchoolUI();
    renderDashboard();
    renderClassSelect();
    renderStudentList();

    const searchEl = document.getElementById('search-student');
    if (searchEl) searchEl.addEventListener('input', renderStudentList);
});

// --- Navigation Logic ---
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${sectionId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'active');
        btn.classList.add('text-slate-400');
        if (btn.dataset.section === sectionId) {
            btn.classList.add('text-indigo-600', 'active');
        }
    });

    if (sectionId === 'scanner') {
        startScanner();
    } else {
        stopScanner();
    }

    if (sectionId === 'dashboard') renderDashboard();
    if (sectionId === 'history') renderHistory();
    if (sectionId === 'reports') renderReports();
    if (sectionId === 'classes') renderClasses();
}

// --- Student Management ---
function openStudentModal(id = null) {
    const modal = document.getElementById('modal-student');
    modal.classList.remove('hidden');
    renderClassSelect();

    if (id) {
        const s = students.find(x => x.id === id);
        document.getElementById('modal-title').innerText = "Edit Siswa";
        document.getElementById('student-id').value = s.id;
        document.getElementById('student-name').value = s.name;
        document.getElementById('student-class').value = s.class;
        document.getElementById('parent-phone').value = s.phone;
    } else {
        document.getElementById('modal-title').innerText = "Tambah Siswa";
        document.getElementById('student-id').value = '';
        document.getElementById('student-name').value = '';
        document.getElementById('parent-phone').value = '';
    }
}

function closeStudentModal() {
    document.getElementById('modal-student').classList.add('hidden');
}

function saveStudent() {
    const id = document.getElementById('student-id').value || Date.now().toString();
    const name = document.getElementById('student-name').value;
    const className = document.getElementById('student-class').value;
    const phone = document.getElementById('parent-phone').value;

    if (!name || !className) return alert("Mohon isi semua field!");

    const index = students.findIndex(s => s.id === id);
    if (index > -1) {
        students[index] = { id, name, class: className, phone };
    } else {
        students.push({ id, name, class: className, phone });
    }

    localStorage.setItem('absensi_students', JSON.stringify(students));
    closeStudentModal();
    renderStudentList();
    Swal.fire('Berhasil', 'Data siswa disimpan', 'success');
}

function deleteStudent(id) {
    if (confirm('Hapus siswa ini?')) {
        students = students.filter(s => s.id !== id);
        localStorage.setItem('absensi_students', JSON.stringify(students));
        renderStudentList();
    }
}

function renderStudentList() {
    const list = document.getElementById('student-list');
    const search = document.getElementById('search-student').value.toLowerCase();
    list.innerHTML = '';

    students.filter(s => s.name.toLowerCase().includes(search) || s.class.toLowerCase().includes(search))
        .forEach(s => {
            const div = document.createElement('div');
            div.className = "bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center";
            div.innerHTML = `
            <div class="w-full flex justify-end gap-2 -mb-2">
                <button onclick="openStudentModal('${s.id}')" class="text-blue-500"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                <button onclick="deleteStudent('${s.id}')" class="text-red-500"><i data-lucide="trash" class="w-4 h-4"></i></button>
            </div>
            <div id="qr-${s.id}" class="mb-3 bg-white p-1"></div>
            <h4 class="font-bold text-slate-800">${s.name}</h4>
            <p class="text-xs text-slate-500 mb-2">${s.class}</p>
            <button onclick="downloadQR('${s.id}', '${s.name}')" class="text-xs bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1">
                <i data-lucide="download" class="w-3 h-3"></i> QR Code
            </button>
        `;
            list.appendChild(div);
            new QRCode(document.getElementById(`qr-${s.id}`), { text: s.id, width: 80, height: 80 });
        });
    lucide.createIcons();
}

function downloadQR(id, name) {
    const canvas = document.querySelector(`#qr-${id} canvas`);
    const link = document.createElement('a');
    link.download = `QR_${name}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

// --- Scanner Logic ---
// PERBAIKAN UTAMA:
// Versi sebelumnya pakai `Html5QrcodeScanner`, yang me-render UI dengan tombol
// "Request Camera Permissions" di dalam div #reader__dashboard. Popup izin kamera
// baru muncul SETELAH tombol itu diklik oleh user. Karena CSS punya aturan
// `#reader__dashboard { display: none; }`, tombol itu jadi tidak kelihatan/tidak
// bisa diklik, sehingga getUserMedia() tidak pernah terpanggil -> layar hitam terus.
//
// Solusinya di sini pakai class `Html5Qrcode` (level lebih rendah) dan memanggil
// `.start()` secara langsung, sehingga kamera diminta otomatis begitu section
// scanner dibuka, tanpa butuh tombol tersembunyi apapun.
async function startScanner() {
    if (isScannerBusy) return;
    isScannerBusy = true;
    isProcessingScan = false;

    const statusEl = document.getElementById('scanner-status');
    const placeholder = document.getElementById('reader-placeholder');
    if (statusEl) statusEl.innerText = '';
    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerText = 'Meminta izin kamera...';
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (placeholder) placeholder.innerText = 'Browser ini tidak mendukung akses kamera. Gunakan Chrome/Safari versi terbaru.';
        isScannerBusy = false;
        return;
    }

    // Pastikan instance sebelumnya benar-benar berhenti dulu
    await stopScanner();

    try {
        html5Qrcode = new Html5Qrcode("reader");

        await html5Qrcode.start(
            { facingMode: "environment" }, // pakai kamera belakang di HP
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            onScanFailureSilent
        );

        // Kamera berhasil terbuka, sembunyikan placeholder
        if (placeholder) placeholder.style.display = 'none';
    } catch (err) {
        console.error('Gagal membuka kamera:', err);
        const message = String(err && err.message ? err.message : err);

        let friendlyMsg = 'Gagal membuka kamera.';
        if (message.includes('NotAllowedError') || message.includes('Permission')) {
            friendlyMsg = 'Izin kamera ditolak. Buka pengaturan browser, aktifkan izin kamera untuk situs ini, lalu muat ulang halaman.';
        } else if (message.includes('NotFoundError')) {
            friendlyMsg = 'Kamera tidak ditemukan di perangkat ini.';
        } else if (message.includes('NotReadableError')) {
            friendlyMsg = 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/video call lain lalu coba lagi.';
        } else if (message.includes('OverconstrainedError')) {
            // Fallback: coba tanpa facingMode kalau device tidak punya kamera belakang
            try {
                html5Qrcode = new Html5Qrcode("reader");
                await html5Qrcode.start(
                    { facingMode: "user" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    onScanSuccess,
                    onScanFailureSilent
                );
                if (placeholder) placeholder.style.display = 'none';
                isScannerBusy = false;
                return;
            } catch (err2) {
                friendlyMsg = 'Tidak ada kamera yang cocok ditemukan.';
            }
        }

        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerText = friendlyMsg;
        }
        if (statusEl) statusEl.innerText = friendlyMsg;
    } finally {
        isScannerBusy = false;
    }
}

function onScanFailureSilent() {
    // Dipanggil terus-menerus tiap frame yang tidak berhasil membaca QR — ini normal,
    // sengaja dikosongkan supaya tidak spam UI.
}

async function stopScanner() {
    if (!html5Qrcode) return;
    try {
        const state = html5Qrcode.getState ? html5Qrcode.getState() : null;
        // Hanya panggil stop() jika scanner memang sedang berjalan
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            await html5Qrcode.stop();
        }
        html5Qrcode.clear();
    } catch (err) {
        console.warn('Peringatan saat menghentikan scanner:', err);
    } finally {
        html5Qrcode = null;
    }
}

function onScanSuccess(decodedText) {
    if (isProcessingScan) return; // cegah frame berikutnya memproses ulang
    const student = students.find(s => s.id === decodedText);

    if (student) {
        isProcessingScan = true;

        // Ambil snapshot dari video feed SEBELUM kamera dimatikan
        const snapshot = captureSnapshotFromVideo();

        stopScanner().then(() => {
            recordAttendance(student, snapshot);
        });
    } else {
        Swal.fire('Error', 'Siswa tidak ditemukan!', 'error');
    }
}

// Mengambil frame video yang sedang tampil di elemen <video> milik html5-qrcode
// dan menggambarnya ke <canvas> tersembunyi untuk dijadikan gambar (data URL).
function captureSnapshotFromVideo() {
    try {
        const videoEl = document.querySelector('#reader video');
        if (!videoEl || videoEl.readyState < 2) return null;

        const canvas = document.getElementById('snapshot-canvas');
        canvas.width = videoEl.videoWidth || 400;
        canvas.height = videoEl.videoHeight || 300;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
        console.warn('Gagal mengambil snapshot:', err);
        return null;
    }
}

function recordAttendance(student, snapshotDataUrl) {
    const today = new Date().toLocaleDateString('id-ID');
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const already = attendanceLogs.find(l => l.studentId === student.id && l.date === today);
    if (already) {
        Swal.fire('Info', `${student.name} sudah absen hari ini.`, 'info');
        showSection('dashboard');
        return;
    }

    const log = {
        id: Date.now(),
        studentId: student.id,
        name: student.name,
        class: student.class,
        date: today,
        time: time
    };

    attendanceLogs.push(log);
    localStorage.setItem('absensi_logs', JSON.stringify(attendanceLogs));

    lastSnapshotDataUrl = snapshotDataUrl;
    lastLogForPhoto = { student, time };

    if (snapshotDataUrl) {
        openPhotoModal(student, snapshotDataUrl);
    } else {
        Swal.fire({
            title: 'Absensi Berhasil!',
            text: `${student.name} telah tercatat hadir. (Foto tidak tersedia)`,
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: 'Kirim WA Orang Tua'
        }).then((result) => {
            if (result.isConfirmed) sendWhatsAppMessage(student, time);
            showSection('dashboard');
        });
    }
}

// --- Modal Foto Absensi ---
function openPhotoModal(student, dataUrl) {
    document.getElementById('photo-preview').src = dataUrl;
    document.getElementById('photo-student-name').innerText = `${student.name} • ${student.class}`;
    document.getElementById('modal-photo').classList.remove('hidden');
}

function closePhotoModal() {
    document.getElementById('modal-photo').classList.add('hidden');
    showSection('dashboard');
}

function downloadSnapshot() {
    if (!lastSnapshotDataUrl || !lastLogForPhoto) return;
    const link = document.createElement('a');
    link.download = `Absensi_${lastLogForPhoto.student.name}_${Date.now()}.jpg`;
    link.href = lastSnapshotDataUrl;
    link.click();
}

// PENTING: WhatsApp (wa.me) tidak menyediakan API gratis untuk mengirim gambar secara
// otomatis tanpa interaksi pengguna dan tanpa WhatsApp Business API resmi (berbayar & perlu approval).
// Jadi di sini: (1) otomatis download foto ke perangkat, (2) buka chat WA dengan pesan siap kirim.
// Tinggal lampirkan foto yang baru terdownload itu secara manual di WhatsApp, lalu tekan kirim.
function sendWhatsAppWithPhoto() {
    if (!lastLogForPhoto) return;
    const { student, time } = lastLogForPhoto;

    if (!student.phone) {
        Swal.fire('Info', 'Nomor WA orang tua belum diisi untuk siswa ini.', 'info');
        return;
    }

    downloadSnapshot();
    sendWhatsAppMessage(student, time);
    closePhotoModal();
}

function sendWhatsAppMessage(student, time) {
    const waLink = `https://wa.me/${student.phone}?text=${encodeURIComponent(`Halo, memberitahukan bahwa *${student.name}* telah hadir di sekolah pada pukul *${time}*. Foto absensi terlampir (silakan lampirkan file yang baru saja terunduh).`)}`;
    window.open(waLink, '_blank');
}

// --- Dashboard, History & Reports ---
function renderDashboard() {
    const today = new Date().toLocaleDateString('id-ID');
    const presentCount = attendanceLogs.filter(l => l.date === today).length;
    document.getElementById('count-present').innerText = presentCount;
    document.getElementById('count-absent').innerText = students.length - presentCount;
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    [...attendanceLogs].reverse().forEach(l => {
        const div = document.createElement('div');
        div.className = "bg-white p-4 rounded-xl shadow-sm flex justify-between items-center";
        div.innerHTML = `
            <div>
                <p class="font-bold">${l.name}</p>
                <p class="text-xs text-slate-500">${l.class} • ${l.date}</p>
            </div>
            <div class="text-indigo-600 font-bold">${l.time}</div>
        `;
        list.appendChild(div);
    });
}

function renderReports() {
    const reportDiv = document.getElementById('report-list');
    let html = `<table class="w-full text-left border-collapse">
        <thead class="bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
                <th class="p-3">Nama Siswa</th>
                <th class="p-3">Hadir</th>
                <th class="p-3">%</th>
            </tr>
        </thead>
        <tbody class="divide-y">`;

    students.forEach(s => {
        const attendanceCount = attendanceLogs.filter(l => l.studentId === s.id).length;
        const percentage = (attendanceCount / 30 * 100).toFixed(0);
        html += `
            <tr class="text-sm">
                <td class="p-3 font-medium">${s.name}<br><span class="text-[10px] text-slate-400">${s.class}</span></td>
                <td class="p-3">${attendanceCount}</td>
                <td class="p-3 text-indigo-600 font-bold">${percentage}%</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    reportDiv.innerHTML = html;
}

// --- Settings & Classes ---
function saveSchoolProfile() {
    schoolProfile.name = document.getElementById('input-school-name').value;
    schoolProfile.address = document.getElementById('input-school-address').value;
    localStorage.setItem('absensi_school', JSON.stringify(schoolProfile));
    updateSchoolUI();
    Swal.fire('Tersimpan', '', 'success');
}

function updateSchoolUI() {
    document.getElementById('display-school-name').innerText = schoolProfile.name;
    document.getElementById('display-school-address').innerText = schoolProfile.address;
    document.getElementById('input-school-name').value = schoolProfile.name;
    document.getElementById('input-school-address').value = schoolProfile.address;
}

function renderClassSelect() {
    const sel = document.getElementById('student-class');
    sel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderClasses() {
    const list = document.getElementById('class-list');
    list.innerHTML = classes.map((c, i) => `
        <li class="p-4 flex justify-between items-center">
            <span>${c}</span>
            <button onclick="deleteClass(${i})" class="text-red-500"><i data-lucide="x-circle" class="w-5 h-5"></i></button>
        </li>
    `).join('');
    lucide.createIcons();
}

function addClass() {
    const name = prompt("Nama Kelas Baru:");
    if (name) {
        classes.push(name);
        localStorage.setItem('absensi_classes', JSON.stringify(classes));
        renderClasses();
    }
}

function deleteClass(index) {
    classes.splice(index, 1);
    localStorage.setItem('absensi_classes', JSON.stringify(classes));
    renderClasses();
}

function clearAllData() {
    if (confirm("Hapus semua data aplikasi?")) {
        localStorage.clear();
        location.reload();
    }
}
