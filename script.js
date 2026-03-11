// --- Replace your entire script.js with this corrected version ---

const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient, myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

window.onload = () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Set default month
    const now = new Date();
    const picker = document.getElementById('month-picker');
    if(picker) picker.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            
            // Assign Button Listeners only after elements are visible
            initButtonListeners();
            fetchData();
        } else {
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
        }
    });
};

function initButtonListeners() {
    // These selectors MUST match your HTML IDs exactly
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.onclick = () => supabaseClient.auth.signOut();

    const addRecBtn = document.getElementById('add-rec-btn');
    if(addRecBtn) addRecBtn.onclick = addRecurringBill;

    const addGoalBtn = document.getElementById('add-goal-btn');
    if(addGoalBtn) addGoalBtn.onclick = addGoal;
}

async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
}

async function fetchData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const [y, m] = document.getElementById('month-picker').value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    try {
        const [exp, inc, bud, rec, gol] = await Promise.all([
            supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
            supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
            supabaseClient.from('budgets').select('*').eq('user_id', user.id),
            supabaseClient.from('recurring_bills').select('*').eq('user_id', user.id),
            supabaseClient.from('savings_goals').select('*').eq('user_id', user.id)
        ]);

        renderUI(exp.data || [], inc.data || [], bud.data || [], rec.data || [], gol.data || []);
    } catch (e) { console.error("Fetch Error:", e); }
}

function renderUI(exp, inc, bud, rec, gol) {
    // 1. Calculate Balance
    const activeRecTotal = rec.filter(r => r.is_active).reduce((s, r) => s + Number(r.amount), 0);
    const totalExp = exp.reduce((s, e) => s + Number(e.amount), 0) + activeRecTotal;
    const totalInc = inc.reduce((s, i) => s + Number(i.amount), 0);
    const balance = totalInc - totalExp;

    const balEl = document.getElementById('net-balance');
    if(balEl) {
        balEl.innerText = rupee.format(balance);
        balEl.style.color = balance < 0 ? '#f43f5e' : 'white';
    }

    // 2. Render Recurring List (Check if element exists first!)
    const recList = document.getElementById('recurring-list');
    if(recList) {
        recList.innerHTML = '';
        rec.forEach(r => {
            recList.innerHTML += `<div style="display:flex; justify-content:space-between; margin-bottom:10px; opacity:${r.is_active?1:0.5}">
                <small>${r.bill_name} (${rupee.format(r.amount)})</small>
                <button onclick="toggleBill('${r.id}', ${r.is_active})" style="width:auto; padding:2px 8px; font-size:10px;">${r.is_active?'Cancel':'On'}</button>
            </div>`;
        });
    }

    // 3. Render Goals
    const goalCont = document.getElementById('goals-container');
    if(goalCont) {
        goalCont.innerHTML = '';
        gol.forEach(g => {
            const per = Math.min((g.current_saved/g.target_amount)*100, 100);
            goalCont.innerHTML += `<small>${g.goal_name}</small>
            <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:4px; margin-bottom:10px;">
                <div style="width:${per}%; background:#fbbf24; height:100%; border-radius:4px;"></div>
            </div>`;
        });
    }

    // 4. Update Chart
    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    updateChart(cats);
}

// Global functions (needed by HTML onclicks)
window.toggleBill = async (id, status) => {
    await supabaseClient.from('recurring_bills').update({ is_active: !status }).eq('id', id);
    fetchData();
};

async function addRecurringBill() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const name = document.getElementById('rec-name').value;
    const amt = document.getElementById('rec-amount').value;
    if(!name || !amt) return;
    await supabaseClient.from('recurring_bills').insert([{ user_id: user.id, bill_name: name, amount: parseFloat(amt), is_active: true }]);
    fetchData();
}

async function addGoal() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const name = document.getElementById('goal-name').value;
    const target = document.getElementById('goal-target').value;
    if(!name || !target) return;
    await supabaseClient.from('savings_goals').insert([{ user_id: user.id, goal_name: name, target_amount: parseFloat(target) }]);
    fetchData();
}

function updateChart(data) {
    const ctxEl = document.getElementById('expenseChart');
    if(!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'], borderWidth: 0 }] },
        options: { plugins: { legend: { labels: { color: 'white' } } }, cutout: '75%' }
    });
}
