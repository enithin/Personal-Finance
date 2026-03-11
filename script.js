const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient, myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

window.onload = () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Set default month
    const now = new Date();
    document.getElementById('month-picker').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            updateProfileUI(session.user);
            fetchExpenses();
        } else {
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
        }
    });
};

// --- AUTH FUNCTIONS ---
async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');
    
    try {
        const { error } = (type === 'login') 
            ? await supabaseClient.auth.signInWithPassword({ email, password })
            : await supabaseClient.auth.signUp({ email, password });
        
        if (error) throw error;
    } catch (err) {
        msg.innerText = err.message;
    }
}

document.getElementById('login-btn').onclick = () => handleAuth('login');
document.getElementById('signup-btn').onclick = () => handleAuth('signup');
document.getElementById('logout-btn').onclick = () => supabaseClient.auth.signOut();

document.getElementById('google-btn').onclick = () => {
    supabaseClient.auth.signInWithOAuth({ provider: 'google' });
};

function updateProfileUI(user) {
    const name = user.user_metadata.full_name || user.email.split('@')[0];
    document.getElementById('user-name').innerText = `Hi, ${name}`;
    if (user.user_metadata.avatar_url) {
        const img = document.getElementById('user-avatar');
        img.src = user.user_metadata.avatar_url;
        img.style.display = 'block';
    }
}

// --- DATA FUNCTIONS ---
async function fetchExpenses() {
    const loader = document.getElementById('loader');
    loader.style.display = 'flex';
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const [year, month] = document.getElementById('month-picker').value.split('-');
        
        const [expRes, budRes] = await Promise.all([
            supabaseClient.from('expenses').select('*').eq('user_id', user.id)
                .gte('date', `${year}-${month}-01`).lte('date', `${year}-${month}-31`),
            supabaseClient.from('budgets').select('*').eq('user_id', user.id)
        ]);

        renderUI(expRes.data || [], budRes.data || []);
    } catch (err) {
        console.error(err);
    } finally {
        loader.style.display = 'none';
    }
}

function renderUI(expenses, budgets) {
    const list = document.getElementById('expense-list');
    const budDiv = document.getElementById('budget-status');
    list.innerHTML = ''; budDiv.innerHTML = '';
    
    let total = 0, cats = {};

    expenses.forEach(e => {
        total += Number(e.amount);
        cats[e.category] = (cats[e.category] || 0) + Number(e.amount);
        
        const li = document.createElement('li');
        li.className = 'stats-card';
        li.style.margin = '10px 0';
        li.innerHTML = `<div style="display:flex; justify-content:space-between">
            <span><b>${e.description}</b><br><small>${e.date}</small></span>
            <span>${rupee.format(e.amount)} <button onclick="deleteExp('${e.id}')" style="width:auto; background:none; color:red; border:none; cursor:pointer">✕</button></span>
        </div>`;
        list.appendChild(li);
    });

    document.getElementById('total-amount').innerText = rupee.format(total);

    budgets.forEach(b => {
        const spent = cats[b.category] || 0;
        const per = Math.min((spent / b.amount) * 100, 100);
        budDiv.innerHTML += `<div style="margin-bottom:10px">
            <small>${b.category}: ${rupee.format(spent)} / ${rupee.format(b.amount)}</small>
            <div style="width:100%; background:#eee; height:8px; border-radius:4px"><div style="width:${per}%; background:${per>90?'red':'#2ecc71'}; height:100%; border-radius:4px"></div></div>
        </div>`;
    });

    updateChart(cats);
}

document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;

    await supabaseClient.from('expenses').insert([{
        user_id: user.id,
        description: document.getElementById('desc').value,
        amount: amount,
        category: category,
        date: new Date().toISOString().split('T')[0]
    }]);

    e.target.reset();
    fetchExpenses();
};

async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('budgets').upsert({
        user_id: user.id,
        category: document.getElementById('budget-category').value,
        amount: parseFloat(document.getElementById('budget-val').value)
    }, { onConflict: 'user_id,category' });
    fetchExpenses();
}

async function deleteExp(id) {
    if(confirm("Delete?")) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        fetchExpenses();
    }
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    
    // Vibrant Neon Palette
    const colors = ['#6366f1', '#f43f5e', '#10b981', '#fbbf24', '#a855f7'];
    
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: colors,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: {
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { family: 'Inter', weight: '600' } }
                }
            },
            cutout: '70%'
        }
    });
}
