const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let expenses = [];
let myChart = null;

// --- AUTH LOGIC ---
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) showApp(); else showAuth();
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

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else showApp();
});

// --- CORE APP LOGIC ---
async function fetchExpenses() {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (!error) { expenses = data; updateUI(); }
}

function updateUI() {
    const list = document.getElementById('expense-list');
    const totalDisplay = document.getElementById('total-amount');
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const filter = document.getElementById('date-filter').value;
    const today = new Date().toISOString().split('T')[0];
    
    list.innerHTML = '';
    let total = 0;
    let totalsByCategory = {};

    expenses.forEach((item, index) => {
        const matchesSearch = item.description.toLowerCase().includes(searchTerm);
        const matchesDate = filter === 'all' || item.date === today;

        if (matchesSearch && matchesDate) {
            total += item.amount;
            totalsByCategory[item.category] = (totalsByCategory[item.category] || 0) + item.amount;
            
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>${item.description}</strong> <small>(${item.category})</small><br>
                    <span style="font-size: 12px">${item.date}</span>
                    ${item.receipt_url ? ` | <a href="${item.receipt_url}" target="_blank">📄</a>` : ''}
                </div>
                <div>
                    <b>$${item.amount.toFixed(2)}</b>
                    <button onclick="deleteExpense('${item.id}')" style="width:auto; margin-left:10px; color:red; border:none; background:none; cursor:pointer">X</button>
                </div>
            `;
            list.appendChild(li);
        }
    });

    totalDisplay.innerText = `$${total.toFixed(2)}`;
    updateBudget(total);
    renderChart(totalsByCategory);
}

// --- FEATURES ---
async function deleteExpense(id) {
    await supabase.from('expenses').delete().eq('id', id);
    fetchExpenses();
}

function updateBudget(total) {
    const limit = parseFloat(document.getElementById('budget-input').value);
    const perc = Math.min((total / limit) * 100, 100);
    document.getElementById('progress-bar').style.width = perc + "%";
    document.getElementById('budget-status').innerText = `$${(limit - total).toFixed(2)} left`;
}

// OCR SCANNING
document.getElementById('scan-btn').addEventListener('click', async () => {
    const file = document.getElementById('receipt-upload').files[0];
    if (!file) return alert("Select a photo first");
    document.getElementById('ocr-status').style.display = 'block';
    
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    const matches = text.match(/\d+\.\d{2}/g);
    if (matches) document.getElementById('amount').value = Math.max(...matches.map(Number));
    document.getElementById('ocr-status').style.display = 'none';
});

// THEME TOGGLE
document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerText = isDark ? '🌙' : '☀️';
});

function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ data: Object.values(data), backgroundColor: ['#00b894', '#0984e3', '#fdcb6e', '#e17055', '#6c5ce7'] }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('receipt-upload').files[0];
    let url = null;
    if (file) {
        const name = Date.now() + file.name;
        await supabase.storage.from('receipts').upload(name, file);
        url = supabase.storage.from('receipts').getPublicUrl(name).data.publicUrl;
    }
    await supabase.from('expenses').insert([{
        description: document.getElementById('desc').value,
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        date: new Date().toISOString().split('T')[0],
        receipt_url: url
    }]);
    fetchExpenses();
    e.target.reset();
});

document.getElementById('search-input').addEventListener('input', updateUI);
document.getElementById('date-filter').addEventListener('change', updateUI);
checkUser();
