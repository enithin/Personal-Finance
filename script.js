// 1. Initialize Supabase
const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// 2. Auth Functions (Global)
async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if(!email || !password) return alert("Please enter email and password.");

    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    
    if (error) alert(error.message);
}

async function logout() {
    await supabaseClient.auth.signOut();
}

// 3. Data Fetching
async function fetchData() {
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
}

// 4. Budget Logic
async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const cat = document.getElementById('budget-cat').value;
    const amt = parseFloat(document.getElementById('budget-amt').value);

    await supabaseClient.from('budgets').upsert({ 
        user_id: user.id, 
        category: cat, 
        amount: amt 
    }, { onConflict: 'user_id, category' });
    
    fetchData();
}

// 5. UI Rendering
function renderUI(exp, inc, bud) {
    const totalExp = exp.reduce((s, e) => s + Number(e.amount), 0);
    const totalInc = inc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(totalInc - totalExp);

    // Render Transaction List
    const list = document.getElementById('expense-list');
    list.innerHTML = exp.map(e => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span>${e.description}</span>
            <span>${rupee.format(e.amount)}</span>
        </div>
    `).join('') || '<p style="opacity:0.5;">No data</p>';

    // Render Chart
    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    updateChart(cats);
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24'] }] }
    });
}

// 6. State Management
supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    
    if (session) {
        const picker = document.getElementById('month-picker');
        picker.value = new Date().toISOString().slice(0, 7);
        fetchData();
    }
});
