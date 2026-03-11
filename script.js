const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient, myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Listeners
    document.getElementById('login-btn').addEventListener('click', () => handleAuth('login'));
    document.getElementById('signup-btn').addEventListener('click', () => handleAuth('signup'));
    document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());

    // 2. App Listeners
    document.getElementById('set-budget-btn').addEventListener('click', saveBudget);
    const picker = document.getElementById('month-picker');
    picker.value = new Date().toISOString().slice(0, 7);
    picker.addEventListener('change', fetchData);

    supabaseClient.auth.onAuthStateChange((event, session) => {
        document.getElementById('auth-container').style.display = session ? 'none' : 'block';
        document.getElementById('app-container').style.display = session ? 'block' : 'none';
        if (session) fetchData();
    });
});

async function fetchData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const [y, m] = document.getElementById('month-picker').value.split('-');
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

    // Budget Progress + 90% Warning
    const budDiv = document.getElementById('budget-status');
    budDiv.innerHTML = '<h3>Budgets</h3>';
    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));

    bud.forEach(b => {
        const spent = cats[b.category] || 0;
        const per = (spent / b.amount) * 100;
        if (per >= 90) alert(`⚠️ Warning: You've used ${per.toFixed(0)}% of your ${b.category} budget!`);

        budDiv.innerHTML += `<div style="margin-bottom:10px;">
            <small>${b.category} (${rupee.format(spent)} / ${rupee.format(b.amount)})</small>
            <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:4px;">
                <div style="width:${Math.min(per, 100)}%; background:${per > 90 ? '#f43f5e' : '#10b981'}; height:100%; border-radius:4px;"></div>
            </div>
        </div>`;
    });

    // Recent Transactions + Delete Button
    const list = document.getElementById('expense-list');
    list.innerHTML = '';
    exp.forEach(e => {
        list.innerHTML += `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span>${e.description}</span>
            <span>${rupee.format(e.amount)} <button onclick="deleteExp('${e.id}')" style="color:#f43f5e; background:none; border:none; cursor:pointer;">✕</button></span>
        </div>`;
    });

    updateChart(cats);
}

window.deleteExp = async (id) => {
    if (confirm("Delete this expense?")) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        fetchData();
    }
};

async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const cat = document.getElementById('budget-cat').value;
    const amt = parseFloat(document.getElementById('budget-amt').value);
    await supabaseClient.from('budgets').upsert({ user_id: user.id, category: cat, amount: amt }, { onConflict: 'user_id, category' });
    fetchData();
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'] }] },
        options: { plugins: { legend: { labels: { color: 'white' } } } }
    });
}
