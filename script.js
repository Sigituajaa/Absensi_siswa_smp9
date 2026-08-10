// --- Data Initializer ---
let students = JSON.parse(localStorage.getItem('absensi_students')) || [];
let classes = JSON.parse(localStorage.getItem('absensi_classes')) || ["X IPA 1", "X IPS 1"];
let attendanceLogs = JSON.parse(localStorage.getItem('absensi_logs')) || [];
let schoolProfile = JSON.parse(localStorage.getItem('absensi_school')) || { name: "SMA Harapan Bangsa", address: "Jl. Pendidikan No. 123" };

let html5QrScanner = null;

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    updateSchoolUI();
    renderDashboard();
    renderClassSelect();
    renderStudentList();
});

// --- Navigation Logic ---
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${sectionId}`).classList.remove('hidden');
    
    // Update Nav UI
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'active');
        btn.classList.add('text-slate-400');
        if(btn.dataset.section === sectionId) {
            btn.classList.add('text-indigo-600', 'active');
        }
    });

    if(sectionId === 'scanner') startScanner();
    else stopScanner();

    if(sectionId === 'dashboard') renderDashboard();
    if(sectionId === 'history') renderHistory();
    if(sectionId === 'reports') renderReports();
    if(sectionId === 'classes') renderClasses();
}

// --- Student Management ---
function openStudentModal(id = null) {
    const modal = document.getElementById('modal-student');
    modal.classList.remove('hidden');
    renderClassSelect();
    
    if(id) {
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

    if(!name || !className) return alert("Mohon isi semua field!");

    const index = students.findIndex(s => s.id === id);
    if(index > -1) {
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
    if(confirm('Hapus siswa ini?')) {
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
function startScanner() {
    html5QrScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrScanner.render(onScanSuccess);
}

function stopScanner() {
    if(html5QrScanner) html5QrScanner.clear();
}

function onScanSuccess(decodedText) {
    const student = students.find(s => s.id === decodedText);
    if(student) {
        stopScanner();
        recordAttendance(student);
    } else {
        Swal.fire('Error', 'Siswa tidak ditemukan!', 'error');
    }
}

function recordAttendance(student) {
    const today = new Date().toLocaleDateString('id-ID');
    const time = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    
    // Cek jika sudah absen hari ini
    const already = attendanceLogs.find(l => l.studentId === student.id && l.date === today);
    if(already) {
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

    // Kirim WA (Simulasi)
    const waLink = `https://wa.me/${student.phone}?text=Halo, memberitahukan bahwa *${student.name}* telah hadir di sekolah pada pukul *${time}*.`;
    
    Swal.fire({
        title: 'Absensi Berhasil!',
        text: `${student.name} telah tercatat hadir.`,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Kirim WA Orang Tua'
    }).then((result) => {
        if (result.isConfirmed) {
            window.open(waLink, '_blank');
        }
        showSection('dashboard');
    });
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
        const percentage = (attendanceCount / 30 * 100).toFixed(0); // Misal 30 hari sekolah
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
    if(name) {
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
    if(confirm("Hapus semua data aplikasi?")) {
        localStorage.clear();
        location.reload();
    }
}

// Search student listener
document.getElementById('search-student').addEventListener('input', renderStudentList);
