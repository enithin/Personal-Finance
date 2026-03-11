const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- 1. CORE FUNCTIONS (Defined Globally) ---

async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Enter email and password");

    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    
    if (error) alert(error.message);
}

async function fetchData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const monthPicker = document.getElementById('month-picker');
    const [y, m] = monthPicker.value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    const [exp, inc, bud] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);

    renderUI(exp.data || [], inc.data || [], bud.data || []);
}

function renderUI(exp, inc, bud) {
    const totalExp = exp.reduce((s, e) => s + Number(e.amount), 0);
    const totalInc = inc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(totalInc - totalExp);

    // Budgets
    const budDiv = document.getElementById('budget-status');
    budDiv.innerHTML = '<h3>Budgets</h3>';
    const cats = {}; 
    exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));

    bud.forEach(b => {
        const spent = cats[b.category] || 0;
        const per = (spent / b.amount) * 100;
        budDiv.innerHTML += `
            <div style="margin-bottom:12px;">
                <small>${b.category} (${rupee.format(spent)} / ${rupee.format(b.amount)})</small>
                <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:10px;">
                    <div style="width:${Math.min(per, 100)}%; background:${per > 90 ? '#f43f5e' : '#10b981'}; height:100%; border-radius:10px;"></div>
                </div>
            </div>`;
    });

    // Transactions
    const list = document.getElementById('expense-list');
    list.innerHTML = '';
    exp.forEach(e => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span>${e.description}</span>
                <span>${rupee.format(e.amount)} <button onclick="deleteExp('${e.id}')" style="color:#f43f5e; background:none; border:none; cursor:pointer; margin-left:10px;">✕</button></span>
            </div>`;
    });

    updateChart(cats);
}

async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const cat = document.getElementById('budget-cat').value;
    const amt = parseFloat(document.getElementById('budget-amt').value);
    if(isNaN(amt)) return alert("Enter a valid amount");

    await supabaseClient.from('budgets').upsert({ user_id: user.id, category: cat, amount: amt }, { onConflict: 'user_id, category' });
    fetchData();
}

window.deleteExp = async (id) => {
    if (confirm("Delete this expense?")) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        fetchData();
    }
};

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'], borderWidth: 0 }] },
        options: { plugins: { legend: { labels: { color: 'white' } } }, cutout: '70%' }
    });
}

// --- 2. INITIALIZATION (Runs on Load) ---

document.addEventListener('DOMContentLoaded', () =>
