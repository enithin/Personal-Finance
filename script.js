// 1. Configuration - Replace with your actual project details
const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient;
let expenses = [];
let myChart = null;

// 2. Initialization - Wait for the library and window to load
window.onload = () => {
    try {
        // Initialize the client using the global 'supabase' object from the CDN
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase initialized successfully.");
        checkUser();
    } catch (err) {
        console.error("Initialization error:", err);
    }
};

// --- AUTH LOGIC ---
async function checkUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (user) {
        showApp();
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

// Sign In
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else showApp();
});

// Sign Up
document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message); else alert("Check your email or try logging in!");
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
});

// --- DATA LOGIC ---
async function fetchExpenses() {
    const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
    
    if (!error) { 
        expenses = data; 
        updateUI(); 
    } else {
        console.error("Fetch error:", error.message);
    }
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

    expenses.forEach((item) => {
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
                    ${item.receipt_url ? ` | <a href="${item.receipt_url}" target="_blank">📄 Receipt</a>` : ''}
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
    const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
    if (!error) fetchExpenses();
}

function updateBudget(total) {
    const budgetInput = document.getElementById('budget-input');
    const limit = parseFloat(budgetInput.value) || 1000;
    const perc = Math.min((total / limit) * 100, 100);
    
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = perc + "%";
    
    // Change color based on percentage
    if (perc < 70) progressBar.style.background = "#00b894";
    else if (perc < 90) progressBar.style.background = "#fdcb6e";
    else progressBar.style.background = "#ff7675";

    document.getElementById('budget-status').innerText = `$${(limit - total).toFixed(2)} left`;
}

// AI OCR Scanning
document.getElementById('scan-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('receipt-upload');
    const file = fileInput.files[0];
    if (!file) return alert("Select a photo of a receipt first");
    
    const status = document.getElementById('ocr-status');
    status.style.display = 'block';
    
    try {
        const { data: { text } } = await Tesseract.recognize(file, 'eng');
        const matches = text.match(/\d+\.\d{2}/g);
        if (matches) {
            const maxPrice = Math.max(...matches.map(Number));
            document.getElementById('amount').value = maxPrice;
        } else {
            alert("Could not find a price. Try a clearer photo.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        status.style.display = 'none';
    }
});

// CSV Export
document.getElementById('export-btn').addEventListener('click', () => {
    if (expenses.length === 0) return;
    const headers = ["Date", "Description", "Category", "Amount"];
    const rows = expenses.map(e => [e.date, `"${e.description}"`, e.category, e.amount]);
    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expenses.csv';
    a.click();
});

// Chart.js Rendering
function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{ 
                data: Object.values(data), 
                backgroundColor: ['#00b894', '#0984e3', '#fdcb6e', '#e17055', '#6c5ce7'] 
            }]
        },
        options: { plugins: { legend: { position: 'bottom' } }, responsive: true }
    });
}

// Theme
