const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart, lastExp = [], lastInc = [], lastBudgets = [];
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- 1. AUTHENTICATION ---
window.handleAuth = async (type) => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
};

window.logout = async () => { await supabaseClient.auth.signOut(); };

// --- 2. DATA ENTRY ---
window.addIncome = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const source = document.getElementById('inc-source').value;
    const amount = document.getElementById('inc-amount').value;
    if(!source || !amount) return alert("Please fill source and amount");
    
    await supabaseClient.from('income').insert([{ 
        user_id: user.id, source, amount: parseFloat(amount), 
        date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.addExpense = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const desc = document.getElementById('exp-desc').value;
    const amt = document.getElementById('exp-amount').value;
    const cat = document.getElementById('exp-cat').value;
    const file = document.getElementById('exp-bill').files[0];
    let billUrl = null;

    if (file) {
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await supabaseClient.storage.from('bills').upload(path, file);
        if (!upErr) {
            const { data: pUrl } = supabaseClient.storage.from('bills').getPublicUrl(path);
            billUrl = pUrl.publicUrl;
        }
    }

    await supabaseClient.from('expenses').insert([{ 
        user_id: user.id, description: desc, amount: parseFloat(amt), 
        category: cat, bill_url: billUrl, date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.saveBudget = async () => {
    // 1. Get the current logged-in user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return alert("You must be logged in to save a budget.");

    // 2. Grab values from the HTML inputs
    const category = document.getElementById('budget-cat-set').value;
    const amount = document.getElementById('budget-amt-set').value;

    // 3. Validation
    if (!amount || parseFloat(amount) <= 0) {
        return alert("Please enter a valid budget amount.");
    }

    // 4. Upsert into Supabase (Update if category exists, Insert if it doesn't)
    const { error } = await supabaseClient
        .from('budgets')
        .upsert({ 
            user_id: user.id, 
            category: category, 
            amount: parseFloat(amount) 
        }, { 
            onConflict: 'user_id, category' 
        });

    if (error) {
        console.error("Budget Error:", error);
        alert("Failed to save budget: " + error.message);
    } else {
        // 5. Refresh data to update the progress bars immediately
        window.fetchData();
        alert(`Budget for ${category} updated successfully!`);
        
        // Clear input
        document.getElementById('budget-amt-set').value = '';
    }
};

window.deleteItem = async (table, id) => {
    if(confirm(`Delete this ${table.slice(0, -1)}?`)) {
        await supabaseClient.from(table).delete().eq('id', id);
        window.fetchData();
    }
};

// --- 3. CORE LOGIC & RENDERING ---
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

    lastExp = exp.data || [];
    lastInc = inc.data || [];
    lastBudgets = bud.data || [];
    window.renderUIFromCache();
};

window.renderUIFromCache = () => {
    const search = document.getElementById('search-bar').value.toLowerCase();
    
    const filteredExp = lastExp.filter(e => e.description.toLowerCase().includes(search));
    const filteredInc = lastInc.filter(i => i.source.toLowerCase().includes(search));

    const tExp = lastExp.reduce((s, e) => s + Number(e.amount), 0);
    const tInc = lastInc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(tInc - tExp);

    // Render Income
    document.getElementById('income-list').innerHTML = '<h4>Income History</h4>' + filteredInc.map(i => `
        <div class="list-item">
            <span>${i.source}</span>
            <span><b style="color:#10b981">+${rupee.format(i.amount)}</b> 
            <button onclick="window.deleteItem('income', '${i.id}')" class="del-btn">✕</button></span>
        </div>
    `).join('') || '<p style="opacity:0.5;">No income entries</p>';

    // Render Expenses
    document.getElementById('expense-list').innerHTML = '<h4>Expense History</h4>' + filteredExp.map(e => `
        <div class="list-item">
            <span>${e.description} ${e.bill_url ? `<a href="${e.bill_url}" target="_blank">📄</a>` : ''}</span>
            <span><b>-${rupee.format(e.amount)}</b> 
            <button onclick="window.deleteItem('expenses', '${e.id}')" class="del-btn">✕</button></span>
        </div>
    `).join('') || '<p style="opacity:0.5;">No expense entries</p>';

    // Render Budgets
    const cats = {}; lastExp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    document.getElementById('budget-status').innerHTML = '<h3>Budget Progress</h3>' + lastBudgets.map(b => {
        const spent = cats[b.category] || 0;
        const per = Math.min((spent / b.amount) * 100, 100);
        return `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                    <span>${b.category}</span>
                    <span>${per.toFixed(0)}% (${rupee.format(b.amount - spent)} left)</span>
                </div>
                <div style="width:100%; background:rgba(255,255,255,0.1); height:8px; border-radius:10px;">
                    <div style="width:${per}%; background:${per > 90 ? '#f43f5e' : '#10b981'}; height:100%; border-radius:10px;"></div>
                </div>
            </div>`;
    }).join('');

    updateChart(cats);
};

// --- 4. VISUALS & PDF ---
function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'], borderWidth: 0 }] },
        options: { plugins: { legend: { position: 'bottom', labels: { color: 'white' } } }, cutout: '70%' }
    });
}

window.downloadPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("FinSwift AI: Monthly Financial Report", 14, 20);
    doc.autoTable({
        startY: 30,
        head: [['Date', 'Description', 'Amount']],
        body: lastExp.map(e => [e.date, e.description, rupee.format(e.amount)])
    });
    doc.save(`Report_${document.getElementById('month-picker').value}.pdf`);
};

// --- 5. INITIALIZATION ---
supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    if (session) {
        document.getElementById('month-picker').value = new Date().toISOString().slice(0, 7);
        window.fetchData();
    }
});
