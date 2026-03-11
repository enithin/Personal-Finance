// --- CONFIGURATION ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_KEY';
let supabaseClient;
let expenses = [];
let myChart = null;

// Currency Formatter
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

window.onload = () => {
    // 1. Initialize Client
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. The Auth State Listener (Critical Fix for Login)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log("Auth Event:", event);
        if (session) {
            showApp();
            processRecurring(); // Auto-add monthly bills
        } else {
            showAuth();
        }
    });

    checkUser();
};

// --- AUTH LOGIC ---
async function checkUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
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

// Google Login Handler
document.getElementById('google-login-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) alert("Google Error: " + error.message);
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

// --- DATA LOGIC ---
async function fetchExpenses() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
    
    if (!error) {
        expenses = data || [];
        updateUI();
    }
}

function updateUI() {
    const list = document.getElementById('expense-list');
    const totalDisplay = document.getElementById('total-amount');
    const budgetInput = document.getElementById('budget-input');
    
    list.innerHTML = '';
    let total = 0;
    let catData = {};

    expenses.forEach(item => {
        const amt = Number(item.amount) || 0;
        total += amt;
        catData[item.category] = (catData[item.category] || 0) + amt;

        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${item.description}</strong> ${item.is_recurring ? '🔄' : ''}<br>
                <small>${item.category} • ${item.date}</small>
            </div>
            <div style="text-align:right">
                <b>${rupee.format(amt)}</b><br>
                <button onclick="deleteExp('${item.id}')" style="color:red;border:none;background:none;cursor:pointer;font-size:12px">Remove</button>
            </div>
        `;
        list.appendChild(li);
    });

    totalDisplay.innerText = rupee.format(total);
    updateProgress(total, parseFloat(budgetInput.value));
    renderChart(catData);
}

// AI OCR Scanning
document.getElementById('scan-btn').addEventListener('click', async () => {
    const file = document.getElementById('receipt-upload').files[0];
    if (!file) return alert("Please pick an image first.");
    
    const btn = document.getElementById('scan-btn');
    btn.innerText = "Scanning AI...";
    
    try {
        const { data: { text } } = await Tesseract.recognize(file, 'eng');
        const matches = text.match(/\d+\.\d{2}/g);
        if (matches) {
            document.getElementById('amount').value = Math.max(...matches.map(Number));
        }
    } catch (e) { console.error(e); }
    btn.innerText = "🔍 AI Scan";
});

// Add Expense (With Image Compression)
document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loader = document.getElementById('loader');
    const submitBtn = document.getElementById('submit-btn');
    const { data: { user } } = await supabaseClient.auth.getUser();

    loader.style.display = 'block';
    submitBtn.disabled = true;

    let file = document.getElementById('receipt-upload').files[0];
    let publicUrl = null;

    try {
        if (file) {
            // COMPRESSION
            file = await imageCompression(file, { maxSizeMB: 0.1, maxWidthOrHeight: 800 });
            const path = `receipts/${user.id}/${Date.now()}.jpg`;
            await supabaseClient.storage.from('receipts').upload(path, file);
            publicUrl = supabaseClient.storage.from('receipts').getPublicUrl(path).data.publicUrl;
        }

        await supabaseClient.from('expenses').insert([{
            user_id: user.id,
            description: document.getElementById('desc').value,
            amount: parseFloat(document.getElementById('amount').value),
            category: document.getElementById('category').value,
            date: new Date().toISOString().split('T')[0],
            is_recurring: document.getElementById('is-recurring').checked,
            receipt_url: publicUrl
        }]);

        e.target.reset();
        fetchExpenses();
    } catch (err) { alert(err.message); }
    finally {
        loader.style.display = 'none';
        submitBtn.disabled = false;
    }
});

// Auto-Recurring Logic
async function processRecurring() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const today = new Date();
    const currentMonth = today.getMonth();
    
    const { data } = await supabaseClient.from('expenses').select('*').eq('is_recurring', true).eq('user_id', user.id);
    
    if (data) {
        for (let item of data) {
            const lastDate = new Date(item.date);
            if (lastDate.getMonth() !== currentMonth) {
                await supabaseClient.from('expenses').insert([{
                    ...item,
                    id: undefined, // Create new ID
                    date: new Date().toISOString().split('T')[0]
                }]);
            }
        }
    }
}

// Charting
function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ data: Object.values(data), backgroundColor: ['#00a8ff','#9c88ff','#fbc531','#4cd137','#e84118'] }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

function updateProgress(total, goal) {
    const perc = Math.min((total / goal) * 100, 100);
    document.getElementById('progress-bar').style.width = perc + '%';
    document.getElementById('budget-status').innerText = `${rupee.format(goal - total)} remaining`;
}

async function deleteExp(id) {
    await supabaseClient.from('expenses').delete().eq('id', id);
    fetchExpenses();
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
});
