const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient, myChart, currentExpenses = [];
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

window.onload = () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const now = new Date();
    document.getElementById('month-picker').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            fetchExpenses();
            predictNextMonth();
        } else {
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
        }
    });
};

// Auth
document.getElementById('login-btn').onclick = async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) alert(error.message);
};

document.getElementById('signup-btn').onclick = async () => {
    const { error } = await supabaseClient.auth.signUp({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    alert(error ? error.message : "Check email for confirmation!");
};

document.getElementById('logout-btn').onclick = () => supabaseClient.auth.signOut();

// Fetch Data
async function fetchExpenses() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const [year, month] = document.getElementById('month-picker').value.split('-');
    
    const [expRes, budRes] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id)
            .gte('date', `${year}-${month}-01`).lte('date', `${year}-${month}-31`).order('date', {ascending: false}),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);

    currentExpenses = expRes.data || [];
    updateUI(currentExpenses, budRes.data || []);
}

function updateUI(expenses, budgets) {
    const list = document.getElementById('expense-list');
    const budStatus = document.getElementById('budget-status');
    list.innerHTML = ''; budStatus.innerHTML = '<h3>Budget Usage</h3>';
    let total = 0, catData = {};

    expenses.forEach(item => {
        total += Number(item.amount);
        catData[item.category] = (catData[item.category] || 0) + Number(item.amount);
        const li = document.createElement('li');
        li.className = 'stats-card';
        li.style.display = 'flex'; li.style.justifyContent = 'space-between';
        li.innerHTML = `<span><b>${item.description}</b><br>${item.date}</span> 
                        <span>${rupee.format(item.amount)} <button onclick="deleteExp('${item.id}')" style="width:auto; background:none; color:red;">✕</button></span>`;
        list.appendChild(li);
    });

    document.getElementById('total-amount').innerText = rupee.format(total);
    
    budgets.forEach(b => {
        const spent = catData[b.category] || 0;
        const per = Math.min((spent/b.amount)*100, 100);
        budStatus.innerHTML += `<small>${b.category}</small>
            <div style="width:100%; background:#eee; height:10px; border-radius:5px; margin-bottom:10px;">
                <div style="width:${per}%; background:${per > 90 ? 'red':'green'}; height:100%; border-radius:5px;"></div>
            </div>`;
    });
    renderChart(catData);
}

// Actions
document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const category = document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);

    await supabaseClient.from('expenses').insert([{
        user_id: user.id, description: document.getElementById('desc').value,
        amount: amount, category: category, date: new Date().toISOString().split('T')[0]
    }]);

    checkBudgetAlert(category, user.id);
    e.target.reset();
    fetchExpenses();
};

async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('budgets').upsert({
        user_id: user.id, 
        category: document.getElementById('budget-category').value,
        amount: parseFloat(document.getElementById('budget-val').value)
    }, { onConflict: 'user_id, category' });
    fetchExpenses();
}

async function deleteExp(id) {
    await supabaseClient.from('expenses').delete().eq('id', id);
    fetchExpenses();
}

// AI Functions
document.getElementById('scan-btn').onclick = async () => {
    const file = document.getElementById('receipt-upload').files[0];
    if (!file) return alert("Select image");
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    const prices = text.match(/\d+\.\d{2}/g);
    if (prices) document.getElementById('amount').value = Math.max(...prices.map(Number));
};

async function predictNextMonth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data } = await supabaseClient.from('expenses').select('amount, date').eq('user_id', user.id);
    if (data.length < 5) return;
    
    const monthly = {};
    data.forEach(e => { const m = e.date.substring(0,7); monthly[m] = (monthly[m] || 0) + Number(e.amount); });
    const vals = Object.values(monthly);
    const n = vals.length;
    let sX=0, sY=0, sXY=0, sX2=0;
    vals.forEach((y, x) => { sX+=x; sY+=y; sXY+=x*y; sX2+=x*x; });
    const slope = (n*sXY - sX*sY) / (n*sX2 - sX*sX);
    const pred = slope * n + (sY - slope*sX)/n;
    document.getElementById('prediction-text').innerHTML = `Next month estimate: <b>${rupee.format(pred)}</b>`;
}

function renderChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#3498db','#2ecc71','#f1c40f','#e74c3c','#9b59b6'] }] }
    });
}

function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Expense Report", 14, 20);
    doc.autoTable({ head: [['Date', 'Desc', 'Cat', 'Amt']], body: currentExpenses.map(e => [e.date, e.description, e.category, e.amount]) });
    doc.save("report.pdf");
}
