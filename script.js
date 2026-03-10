const SUPABASE_URL = 'YOUR_URL';
const SUPABASE_KEY = 'YOUR_KEY';
let supabaseClient;
let expenses = [];
let myChart = null;

const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

window.onload = () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    checkUser();
};

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        showApp();
        processRecurring();
    } else {
        showAuth();
    }
}

function showApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    fetchExpenses();
}

function showAuth() {
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
}

// Google Login
document.getElementById('google-login-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
});

// AI OCR Scanning
document.getElementById('scan-btn').addEventListener('click', async () => {
    const file = document.getElementById('receipt-upload').files[0];
    if (!file) return alert("Upload a photo first");
    const btn = document.getElementById('scan-btn');
    btn.innerText = "Scanning...";
    
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    const prices = text.match(/\d+\.\d{2}/g);
    if (prices) document.getElementById('amount').value = Math.max(...prices.map(Number));
    btn.innerText = "🔍 AI Scan";
});

// Add Expense with Compression
document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loader = document.getElementById('loader');
    loader.style.display = 'block';

    let file = document.getElementById('receipt-upload').files[0];
    let publicUrl = null;

    if (file) {
        file = await imageCompression(file, { maxSizeMB: 0.2, maxWidthOrHeight: 1024 });
        const fileName = `${Date.now()}_receipt.jpg`;
        await supabaseClient.storage.from('receipts').upload(fileName, file);
        publicUrl = supabaseClient.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
    }

    await supabaseClient.from('expenses').insert([{
        description: document.getElementById('desc').value,
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        date: new Date().toISOString().split('T')[0],
        receipt_url: publicUrl,
        is_recurring: document.getElementById('is-recurring').checked
    }]);

    loader.style.display = 'none';
    e.target.reset();
    fetchExpenses();
});

async function fetchExpenses() {
    const { data } = await supabaseClient.from('expenses').select('*').order('date', { ascending: false });
    expenses = data || [];
    updateUI();
}

function updateUI() {
    const list = document.getElementById('expense-list');
    list.innerHTML = '';
    let total = 0;
    let categories = {};

    expenses.forEach(item => {
        total += item.amount;
        categories[item.category] = (categories[item.category] || 0) + item.amount;
        const li = document.createElement('li');
        li.innerHTML = `
            <div><b>${item.description}</b> ${item.is_recurring ? '🔄' : ''}<br><small>${item.date}</small></div>
            <div>${rupee.format(item.amount)} <button onclick="deleteExp('${item.id}')" style="width:auto;color:red;border:none;background:none;">✕</button></div>
        `;
        list.appendChild(li);
    });

    document.getElementById('total-amount').innerText = rupee.format(total);
    renderChart(categories);
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ data: Object.values(data), backgroundColor: ['#00a8ff','#9c88ff','#fbc531','#4cd137','#e84118'] }]
        }
    });
}

async function deleteExp(id) {
    await supabaseClient.from('expenses').delete().eq('id', id);
    fetchExpenses();
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

// Theme
document.getElementById('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
});
