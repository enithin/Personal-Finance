// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient;
let expenses = [];
let myChart = null;

const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- 2. INITIALIZATION ---
window.onload = () => {
    // Initialize Supabase
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Auth State Listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log("Auth Event:", event);
        if (session) {
            showApp();
            processRecurring();
        } else {
            showAuth();
        }
    });
};

// --- 3. UI TOGGLES ---
function showApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    fetchExpenses();
}

function showAuth() {
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
}

// --- 4. AUTHENTICATION HANDLERS ---
document.getElementById('login-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert("Login Error: " + error.message);
});

document.getElementById('signup-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert("Sign Up Error: " + error.message);
    else alert("Success! Check your email (or try logging in if you disabled confirmation).");
});

document.getElementById('google-login-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

// --- 5. CORE EXPENSE LOGIC ---
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
    list.innerHTML = '';
    let total = 0;
    let catData = {};

    expenses.forEach(item => {
        const amt = Number(item.amount) || 0;
        total += amt;
        catData[item.category] = (catData[item.category] || 0) + amt;

        const li = document.createElement('li');
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center; padding: 10px 0; border-bottom: 1px solid #eee;">
                <div>
                    <strong>${item.description}</strong><br>
                    <small style="color: #888;">${item.category} • ${item.date}</small>
                </div>
                <div style="text-align: right;">
                    <b style="color: #2ecc71;">${rupee.format(amt)}</b><br>
                    <button onclick="deleteExp('${item.id}')" style="color: #e74c3c; border:none; background:none; cursor:pointer; font-size: 12px;">Delete</button>
                </div>
            </div>
        `;
        list.appendChild(li);
    });

    document.getElementById('total-amount').innerText = rupee.format(total);
    renderChart(catData);
}

// --- 6. AI & PERFORMANCE ---
document.getElementById('scan-btn').addEventListener('click', async () => {
    const file = document.getElementById('receipt-upload').files[0];
    if (!file) return alert("Select a receipt image first");
    const btn = document.getElementById('scan-btn');
    btn.innerText = "Scanning...";
    
    try {
        const { data: { text } } = await Tesseract.recognize(file, 'eng');
        const prices = text.match(/\d+\.\d{2}/g);
        if (prices) document.getElementById('amount').value = Math.max(...prices.map(Number));
    } catch (e) { 
        console.error("OCR Error:", e);
        alert("Could not read receipt. Please enter manually.");
    }
    btn.innerText = "🔍 AI Scan";
});

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'block';

    const { data: { user } } = await supabaseClient.auth.getUser();
    let file = document.getElementById('receipt-upload').files[0];
    let publicUrl = null;

    try {
        if (file) {
            const options = { maxSizeMB: 0.1, maxWidthOrHeight: 800 };
            file = await imageCompression(file, options);
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
            receipt_url: publicUrl,
            is_recurring: document.getElementById('is-recurring').checked
        }]);

        e.target.reset();
        fetchExpenses();
    } catch (err) {
        alert("Upload Error: " + err.message);
    } finally {
        if(loader) loader.style.display = 'none';
    }
});

// --- 7. UTILITIES ---
window.deleteExp = async (id) => {
    const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchExpenses();
};

function renderChart(data) {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ 
                data: Object.values(data), 
                backgroundColor: ['#00a8ff','#9c88ff','#fbc531','#4cd137','#e84118'] 
            }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

async function processRecurring() {
    // Basic logic to check for recurring entries
    console.log("Checking for recurring expenses...");
}
