const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- GLOBAL FUNCTIONS (Attached to window so HTML can see them) ---

window.handleAuth = async (type) => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
};

window.logout = async () => { await supabaseClient.auth.signOut(); };

window.addIncome = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const source = document.getElementById('inc-source').value;
    const amount = document.getElementById('inc-amount').value;
    if(!source || !amount) return alert("Fill all fields");
    
    await supabaseClient.from('income').insert([{ 
        user_id: user.id, 
        source, 
        amount: parseFloat(amount), 
        date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.addExpense = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const desc = document.getElementById('exp-desc').value;
    const amt = document.getElementById('exp-amount').value;
    const cat = document.getElementById('exp-cat').value;
    if(!desc || !amt) return alert("Fill all fields");

    await supabaseClient.from('expenses').insert([{ 
        user_id: user.id, 
        description: desc, 
        amount: parseFloat(amt), 
        category: cat, 
        date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.fetchData = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const picker = document.getElementById('month-picker');
    const [y, m] = picker.value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    const [exp, inc, bud] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);
    renderUI(exp.data || [], inc.data || [], bud.data || []);
};

// --- INTERNAL UI LOGIC ---

function renderUI(exp, inc, bud) {
    const tExp = exp.reduce((s, e) => s + Number(e.amount), 0);
    const tInc = inc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(tInc - tExp);

    const list = document.getElementById('expense-list');
    list.innerHTML = exp.map(e => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span>${e.description}</span>
            <span>${rupee.format(e.amount)}</span>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.5;">No entries</p>';

    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    updateChart(cats);
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'] }] }
    });
}

// --- INITIALIZATION ---

supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    if (session) {
        document.getElementById('month-picker').value = new Date().toISOString().slice(0, 7);
        window.fetchData();
    }
});
